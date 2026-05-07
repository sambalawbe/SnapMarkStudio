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

// Simple in-memory store for bot user settings
const userSettings: Record<number, { logoBuffers: Buffer[] }> = {};

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // --- TELEGRAM BOT LOGIC ---
  if (token && token !== "MY_TOKEN") {
    const bot = new Telegraf(token);

    bot.start((ctx) => {
      ctx.reply("Bienvenue sur SnapMark Studio ! 📸\n\nEnvoyez-moi une photo pour y apposer un filigrane.\n\nOptionnel : Envoyez-moi jusqu'à 2 logos (image PNG ou JPG) pour les personnaliser. Ils seront affichés côte à côte.");
    });

    // Handle Photos
    bot.on(message("photo"), async (ctx) => {
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // get best quality
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        
        ctx.reply("Traitement en cours... 🔄");

        // Download photo
        const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
        const photoBuffer = Buffer.from(response.data);

        // Get user logos or default
        let currentLogoBuffers: Buffer[] = userSettings[ctx.from.id]?.logoBuffers || [];
        
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

        if (!userSettings[ctx.from.id]) {
          userSettings[ctx.from.id] = { logoBuffers: [] };
        }

        const buffers = userSettings[ctx.from.id].logoBuffers;
        buffers.push(logoBuffer);
        
        // Keep only last 2
        if (buffers.length > 2) {
          buffers.shift();
        }
        
        ctx.reply(`✅ Logo ajouté (${buffers.length}/2). Envoyez un autre logo pour le duo, ou une photo pour tester.`);
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
