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
// In a real app, use a database (Firebase, etc.)
const userSettings: Record<number, { logoBuffer?: Buffer, logoName?: string }> = {};

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // --- TELEGRAM BOT LOGIC ---
  if (token && token !== "MY_TOKEN") {
    const bot = new Telegraf(token);

    bot.start((ctx) => {
      ctx.reply("Bienvenue sur SnapMark Studio ! 📸\n\nEnvoyez-moi une photo pour y apposer un filigrane.\n\nOptionnel : Envoyez-moi d'abord votre logo (image PNG ou JPG) pour le personnaliser.");
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

        // Get user logo or default
        let logoBuffer: Buffer;
        const savedLogo = userSettings[ctx.from.id]?.logoBuffer;
        
        if (savedLogo) {
          logoBuffer = savedLogo;
        } else {
          // Use default logo (prioritizing logo.png then favicon.svg)
          const customLogoPath = path.join(process.cwd(), "src", "logo.png");
          const faviconPath = path.join(process.cwd(), "src", "favicon.svg");
          
          if (fs.existsSync(customLogoPath)) {
            logoBuffer = fs.readFileSync(customLogoPath);
          } else if (fs.existsSync(faviconPath)) {
            logoBuffer = fs.readFileSync(faviconPath);
          } else {
            // Fallback: simple text or empty transparent if everything fails
            logoBuffer = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 96, g: 165, b: 250, alpha: 0.5 } } }).png().toBuffer();
          }
        }

        // Process with Sharp
        const metadata = await sharp(photoBuffer).metadata();
        const width = metadata.width || 1000;
        const height = metadata.height || 1000;

        // Resize logo to ~3.75% of width
        const logoSize = Math.round(width * 0.0375);
        const resizedLogo = await sharp(logoBuffer)
          .resize(logoSize, logoSize, { fit: 'inside' })
          .toBuffer();

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

        const processedBuffer = await sharp(photoBuffer)
          .composite([
            { input: resizedLogo, gravity: 'south', top: height - logoSize - 20, left: Math.round((width - logoSize) / 2) }, // Bottom center
            { input: dateSvg, top: 0, left: 0 }
          ])
          .toBuffer();

        // Send back
        await ctx.replyWithPhoto({ source: processedBuffer });
      } catch (error) {
        console.error("Bot error:", error);
        ctx.reply("Désolé, une erreur est survenue lors du traitement. 😕");
      }
    });

    // Handle Logo Updates (when user sends an image/doc as logo)
    bot.on(message("document"), async (ctx) => {
      if (ctx.message.document.mime_type?.startsWith("image/")) {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
        
        userSettings[ctx.from.id] = { 
          logoBuffer: Buffer.from(response.data),
          logoName: ctx.message.document.file_name
        };
        
        ctx.reply(`✅ Logo mis à jour : ${ctx.message.document.file_name}`);
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
