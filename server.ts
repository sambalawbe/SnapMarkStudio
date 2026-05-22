import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import sharp from "sharp";
import axios from "axios";
import fs from "fs";

// Initialize Express
const app = express();
const PORT = 3000;

const LOGOS_DIR = path.join(process.cwd(), "data", "logos");
fs.mkdirSync(LOGOS_DIR, { recursive: true });

function getUserLogos(userId: number): Buffer[] {
  const userDir = path.join(LOGOS_DIR, String(userId));
  if (!fs.existsSync(userDir)) return [];
  try {
    const files = fs.readdirSync(userDir).filter(f => f.endsWith(".png")).sort();
    return files.map(file => fs.readFileSync(path.join(userDir, file)));
  } catch (err) {
    console.error("Error reading user logos:", err);
    return [];
  }
}

function saveUserLogo(userId: number, logoBuffer: Buffer) {
  const userDir = path.join(LOGOS_DIR, String(userId));
  fs.mkdirSync(userDir, { recursive: true });
  
  const files = fs.readdirSync(userDir).filter(f => f.endsWith(".png")).sort();
  
  if (files.length >= 2) {
    try {
      fs.unlinkSync(path.join(userDir, files[0]));
    } catch (e) {
      console.error("Failed to delete old logo:", e);
    }
  }
  
  const fileName = `${Date.now()}.png`;
  fs.writeFileSync(path.join(userDir, fileName), logoBuffer);
}

function clearUserLogos(userId: number) {
  const userDir = path.join(LOGOS_DIR, String(userId));
  if (fs.existsSync(userDir)) {
    const files = fs.readdirSync(userDir);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(userDir, file));
      } catch (e) {}
    }
    try {
      fs.rmdirSync(userDir);
    } catch (e) {}
  }
}

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // --- TELEGRAM BOT LOGIC ---
  if (token && token !== "MY_TOKEN") {
    const bot = new Telegraf(token);

    bot.start((ctx) => {
      ctx.reply("Bienvenue sur SnapMark Studio ! 📸\n\n" +
                "Envoyez-moi une photo pour y apposer un filigrane.\n\n" +
                "Optionnel :\n" +
                "- Envoyez-moi jusqu'à 2 logos (comme Document ou Image) pour les personnaliser. Ils seront affichés côte à côte.\n" +
                "- Utilisez /status pour voir vos logos actifs.\n" +
                "- Utilisez /clear pour réinitialiser vos logos.");
    });

    bot.command("clear", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      clearUserLogos(userId);
      ctx.reply("🗑️ Tous vos logos personnalisés ont été supprimés. Les paramètres par défaut seront utilisés.");
    });

    bot.command("status", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      const count = getUserLogos(userId).length;
      ctx.reply(`ℹ️ Statut de votre SnapMark Studio :\n- Logos personnalisés : ${count}/2\n${count > 0 ? "Vos logos seront apposés sur vos photos." : "Le logo par défaut sera utilisé."}`);
    });

    // Handle Photos
    bot.on(message("photo"), async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // get best quality
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        
        ctx.reply("Traitement en cours... 🔄");

        // Download photo
        const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
        const photoBuffer = Buffer.from(response.data);

        // Get user logos or default
        let currentLogoBuffers: Buffer[] = getUserLogos(userId);
        
        if (currentLogoBuffers.length === 0) {
          // Use default logo (prioritizing logo.png then favicon.svg)
          const customLogoPath = path.join(process.cwd(), "src", "logo.png");
          const faviconPath = path.join(process.cwd(), "src", "favicon.svg");
          
          if (fs.existsSync(customLogoPath)) {
            currentLogoBuffers = [fs.readFileSync(customLogoPath)];
          } else if (fs.existsSync(faviconPath)) {
            currentLogoBuffers = [fs.readFileSync(faviconPath)];
          }
        }

        // Process with Sharp
        const metadata = await sharp(photoBuffer).metadata();
        const width = metadata.width || 1000;
        const height = metadata.height || 1000;

        // Resize logos to ~3.75% of width each
        const logoSize = Math.round(width * 0.0375);
        const spacing = Math.round(logoSize * 0.1);

        const composites: any[] = [];
        
        if (currentLogoBuffers.length > 0) {
          const resizedLogos = await Promise.all(currentLogoBuffers.map(buf => 
            sharp(buf).resize(logoSize, logoSize, { fit: 'inside' }).toBuffer()
          ));

          const totalLogosWidth = (resizedLogos.length * logoSize) + ((resizedLogos.length - 1) * spacing);
          const startX = Math.round((width - totalLogosWidth) / 2);
          const y = height - logoSize - 20;

          resizedLogos.forEach((logoBuf, index) => {
            composites.push({
              input: logoBuf,
              top: y,
              left: startX + (index * (logoSize + spacing))
            });
          });
        }

        // Prepare Date overlay
        const dateText = new Date().toLocaleDateString('fr-FR');
        const fontSize = Math.round(width * 0.02);
        
        // Create an SVG for the date
        const dateSvg = Buffer.from(`<svg width="${width}" height="${height}">
          <style>
            .date { fill: white; font-size: ${fontSize}px; font-family: sans-serif; font-weight: bold; }
            .shadow { fill: black; fill-opacity: 0.5; font-size: ${fontSize}px; font-family: sans-serif; font-weight: bold; }
          </style>
          <text x="${width - 10 - 2}" y="${20 + fontSize + 2}" class="shadow" text-anchor="end">${dateText}</text>
          <text x="${width - 10}" y="${20 + fontSize}" class="date" text-anchor="end">${dateText}</text>
        </svg>`);

        composites.push({ input: dateSvg, top: 0, left: 0 });

        const processedBuffer = await sharp(photoBuffer)
          .composite(composites)
          .toBuffer();

        // Send back
        await ctx.replyWithPhoto({ source: processedBuffer });
      } catch (error) {
        console.error("Bot error:", error);
        ctx.reply("Désolé, une erreur est survenue lors du traitement. 😕");
      }
    });

    // Handle Logo Updates
    bot.on([message("document"), message("photo")], async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      let fileId = "";
      let fileName = "logo.png";

      if ("document" in ctx.message && ctx.message.document.mime_type?.startsWith("image/")) {
        fileId = ctx.message.document.file_id;
        fileName = ctx.message.document.file_name || "logo.png";
      } else if ("photo" in ctx.message) {
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      } else {
        return; // Not an image
      }

      try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(response.data);

        saveUserLogo(userId, logoBuffer);
        const count = getUserLogos(userId).length;
        
        ctx.reply(`✅ Logo ajouté (${count}/2). Envoyez un autre logo pour le duo, ou une photo pour tester.`);
      } catch (err) {
        ctx.reply("Erreur lors de l'enregistrement du logo.");
      }
    });

    bot.launch();
    console.log("Telegram Bot started!");
  } else {
    console.warn("TELEGRAM_BOT_TOKEN missing. Bot feature disabled.");
  }

  // --- EXPRESS SERVER + VITE ---
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Serve the default logo to the web app
  app.get("/logo.png", (req, res) => {
    const customLogoPath = path.join(process.cwd(), "src", "logo.png");
    const faviconPath = path.join(process.cwd(), "src", "favicon.svg");
    
    if (fs.existsSync(customLogoPath)) {
      res.sendFile(customLogoPath);
    } else if (fs.existsSync(faviconPath)) {
      res.sendFile(faviconPath);
    } else {
      res.status(404).send("Not found");
    }
  });
}

startServer().catch(err => {
  console.error("Server startup error:", err);
});
