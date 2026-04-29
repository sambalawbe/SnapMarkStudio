/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Image as ImageIcon, 
  Upload, 
  Download, 
  Settings, 
  Calendar, 
  Layout, 
  X, 
  Plus, 
  CheckCircle2, 
  Loader2,
  FolderOpen,
  Settings2,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Types
type Position = 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center' | 'center';

interface AppState {
  photos: File[];
  logo: File | null;
  logoPreview: string | null;
  processing: boolean;
  progress: number;
  config: {
    logoPosition: Position;
    logoScale: number; // Percentage of image width
    logoOpacity: number;
    logoMargin: number; // Percentage of image width
    dateEnabled: boolean;
    datePosition: Position;
    fontSize: number;
    fontColor: string;
    dateFormat: 'current' | 'original'; // 'original' would need EXIF, let's stick to current or manual for now
    customDate: string;
  }
}

const INITIAL_CONFIG = {
  logoPosition: 'bottom-right' as Position,
  logoScale: 15,
  logoOpacity: 0.8,
  logoMargin: 2,
  dateEnabled: true,
  datePosition: 'top-right' as Position,
  fontSize: 32,
  fontColor: '#ffffff',
  dateFormat: 'current' as const,
  customDate: new Date().toLocaleDateString('fr-FR'),
};

export default function App() {
  const [state, setState] = useState<AppState>({
    photos: [],
    logo: null,
    logoPreview: null,
    processing: false,
    progress: 0,
    config: INITIAL_CONFIG
  });

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // Handle Directory Selection
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = (Array.from(e.target.files) as File[]).filter(file => file.type.startsWith('image/'));
      setState(prev => ({ ...prev, photos: filesArray }));
    }
  };

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setState(prev => ({ 
          ...prev, 
          logo: file, 
          logoPreview: reader.result as string 
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Image Processing Logic
  const processImage = useCallback(async (photo: File, logoImg: HTMLImageElement | null, config: typeof state.config): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Could not get canvas context');

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw basic image
        ctx.drawImage(img, 0, 0);

        // Draw Logo
        if (logoImg) {
          ctx.save();
          ctx.globalAlpha = config.logoOpacity;
          
          const targetWidth = (canvas.width * config.logoScale) / 100;
          const targetHeight = (logoImg.height / logoImg.width) * targetWidth;
          const margin = (canvas.width * config.logoMargin) / 100;

          let x = 0;
          let y = 0;

          switch (config.logoPosition) {
            case 'top-left': x = margin; y = margin; break;
            case 'top-right': x = canvas.width - targetWidth - margin; y = margin; break;
            case 'top-center': x = (canvas.width - targetWidth) / 2; y = margin; break;
            case 'bottom-left': x = margin; y = canvas.height - targetHeight - margin; break;
            case 'bottom-right': x = canvas.width - targetWidth - margin; y = canvas.height - targetHeight - margin; break;
            case 'bottom-center': x = (canvas.width - targetWidth) / 2; y = canvas.height - targetHeight - margin; break;
            case 'center': x = (canvas.width - targetWidth) / 2; y = (canvas.height - targetHeight) / 2; break;
          }

          ctx.drawImage(logoImg, x, y, targetWidth, targetHeight);
          ctx.restore();
        }

        // Draw Date
        if (config.dateEnabled) {
          const fontSize = (canvas.width * config.fontSize) / 2000; // Responsive font size
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillStyle = config.fontColor;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;

          const dateText = config.customDate || new Date().toLocaleDateString('fr-FR');
          const textMetrics = ctx.measureText(dateText);
          const margin = (canvas.width * 2) / 100;

          let x = 0;
          let y = 0;

          switch (config.datePosition) {
            case 'top-left': x = margin; y = margin + fontSize; break;
            case 'top-right': x = canvas.width - textMetrics.width - margin; y = margin + fontSize; break;
            case 'top-center': x = (canvas.width - textMetrics.width) / 2; y = margin + fontSize; break;
            case 'bottom-left': x = margin; y = canvas.height - margin; break;
            case 'bottom-right': x = canvas.width - textMetrics.width - margin; y = canvas.height - margin; break;
            case 'bottom-center': x = (canvas.width - textMetrics.width) / 2; y = canvas.height - margin; break;
            case 'center': x = (canvas.width - textMetrics.width) / 2; y = (canvas.height + fontSize) / 2; break;
          }

          ctx.fillText(dateText, x, y);
        }

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject('Blob conversion failed');
        }, 'image/jpeg', 0.9);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(photo);
    });
  }, []);

  // Update Preview
  useEffect(() => {
    if (state.photos.length > 0) {
      const updatePreview = async () => {
        let logoImg: HTMLImageElement | null = null;
        if (state.logoPreview) {
          logoImg = new Image();
          logoImg.src = state.logoPreview;
          await new Promise(r => logoImg!.onload = r);
        }

        try {
          const processedBlob = await processImage(state.photos[0], logoImg, state.config);
          setPreviewSrc(URL.createObjectURL(processedBlob));
        } catch (e) {
          console.error('Preview error:', e);
        }
      };
      updatePreview();
    } else {
      setPreviewSrc(null);
    }
  }, [state.photos, state.logoPreview, state.config, processImage]);

  const startProcessing = async () => {
    if (state.photos.length === 0) return;
    
    setState(prev => ({ ...prev, processing: true, progress: 0 }));
    
    const zip = new JSZip();
    let logoImg: HTMLImageElement | null = null;
    
    if (state.logoPreview) {
      logoImg = new Image();
      logoImg.src = state.logoPreview;
      await new Promise(r => logoImg!.onload = r);
    }

    try {
      for (let i = 0; i < state.photos.length; i++) {
        const photo = state.photos[i];
        const processedBlob = await processImage(photo, logoImg, state.config);
        zip.file(`processed_${photo.name}`, processedBlob);
        
        setState(prev => ({ ...prev, progress: Math.round(((i + 1) / state.photos.length) * 100) }));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'photos_marquees.zip');
    } catch (error) {
      console.error('Processing error:', error);
      alert('Une erreur est survenue lors du traitement.');
    } finally {
      setState(prev => ({ ...prev, processing: false }));
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text p-6 flex flex-col gap-6 max-w-[1400px] mx-auto overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-border pb-4">
        <div className="text-accent text-xl font-bold tracking-tighter">PIXELSTAMP v1.0</div>
        <div className="text-text-dim text-xs font-mono">
          Session : {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_240px] gap-4">
        {/* Left Columns: Inputs */}
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
          {/* Card 1: Media Source */}
          <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">1. Source des médias</h2>
            
            <div className="relative group">
              <input
                type="file"
                multiple
                //@ts-ignore
                webkitdirectory=""
                onChange={handleFolderSelect}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <button className="w-full bg-accent text-black font-bold py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity">
                Choisir Dossier
              </button>
            </div>

            <div className="bg-black/20 border border-border/50 border-dashed rounded-lg p-3">
              <div className="text-sm font-medium truncate">
                {state.photos.length > 0 ? `photos/${state.photos[0].webkitRelativePath.split('/')[0]}` : '/aucun_dossier'}
              </div>
              <div className="text-xs text-text-dim mt-1">
                {state.photos.length} images détectées (JPG, PNG)
              </div>
            </div>
          </section>

          {/* Card 2: Logo Config */}
          <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">2. Configuration Logo</h2>
            
            <div className="flex justify-between items-center">
              <span className="text-sm">Fichier Logo</span>
              <div className="relative">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleLogoUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <button className="text-[11px] font-semibold px-2 py-1 border border-border rounded hover:border-text-dim transition-colors">
                  Changer
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Position</span>
                <select 
                  value={state.config.logoPosition}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoPosition: e.target.value as Position } }))}
                  className="bg-bg border border-border text-xs p-1.5 rounded w-32 focus:outline-accent"
                >
                  <option value="bottom-right">Bas-Droite</option>
                  <option value="bottom-left">Bas-Gauche</option>
                  <option value="bottom-center">Bas-Milieu</option>
                  <option value="top-right">Haut-Droite</option>
                  <option value="top-left">Haut-Gauche</option>
                  <option value="top-center">Haut-Milieu</option>
                  <option value="center">Centre</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-text-dim uppercase">
                  <span>Opacité</span>
                  <span>{Math.round(state.config.logoOpacity * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="1" step="0.1" value={state.config.logoOpacity}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoOpacity: parseFloat(e.target.value) } }))}
                  className="w-full h-1 bg-bg border border-border appearance-none rounded-full accent-accent"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-text-dim uppercase">
                  <span>Taille</span>
                  <span>{state.config.logoScale}%</span>
                </div>
                <input 
                  type="range" min="5" max="50" value={state.config.logoScale}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoScale: parseInt(e.target.value) } }))}
                  className="w-full h-1 bg-bg border border-border appearance-none rounded-full accent-accent"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Center Column: Preview */}
        <section className="bg-black border border-border rounded-xl relative flex items-center justify-center overflow-hidden min-h-[400px]">
          <AnimatePresence mode="wait">
            {previewSrc ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative w-[90%] h-[90%] flex items-center justify-center"
              >
                <img 
                  src={previewSrc} 
                  alt="Aperçu" 
                  className="max-w-full max-h-full object-contain rounded-sm shadow-2xl"
                />
                <div className="absolute bottom-[-30px] left-1/2 -translate-x-1/2 text-text-dim text-[11px] whitespace-nowrap">
                  Aperçu : {state.photos[0].name} (1/{state.photos.length})
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-text-dim/30">
                <ImageIcon className="w-12 h-12" />
                <span className="text-xs uppercase tracking-widest font-bold">Aucun média</span>
              </div>
            )}
          </AnimatePresence>
        </section>

        {/* Right Column: Date & Action */}
        <div className="flex flex-col gap-4">
          {/* Card 3: Timestamp */}
          <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">3. Horodatage</h2>
            
            <div className="flex justify-between items-center">
              <span className="text-sm">Activer</span>
              <input 
                type="checkbox" 
                checked={state.config.dateEnabled}
                onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, dateEnabled: e.target.checked } }))}
                className="accent-accent w-4 h-4 cursor-pointer"
              />
            </div>

            {state.config.dateEnabled && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-[11px]">Format</span>
                  <select 
                    value={state.config.customDate}
                    onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, customDate: e.target.value } }))}
                    className="bg-bg border border-border text-[11px] p-1 rounded w-32 focus:outline-accent"
                  >
                    <option value={new Date().toLocaleDateString('fr-FR')}>JJ/MM/AAAA</option>
                    <option value={new Date().toLocaleDateString('sv-SE')}>AAAA-MM-JJ</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm">Position</span>
                  <select 
                    value={state.config.datePosition}
                    onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, datePosition: e.target.value as Position } }))}
                    className="bg-bg border border-border text-xs p-1.5 rounded w-32 focus:outline-accent"
                  >
                    <option value="top-left">Haut-Gauche</option>
                    <option value="top-right">Haut-Droite</option>
                    <option value="top-center">Haut-Milieu</option>
                    <option value="bottom-left">Bas-Gauche</option>
                    <option value="bottom-right">Bas-Droite</option>
                    <option value="bottom-center">Bas-Milieu</option>
                  </select>
                </div>
                
                <div className="text-[11px] text-text-dim leading-tight">
                  La date sera apposée sur chaque photo avec un effet de relief.
                </div>
              </div>
            )}
          </section>

          {/* Batch Status */}
          <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 flex-1">
            <h2 className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">Batch Status</h2>
            
            <div className="flex-1 flex flex-col justify-center items-center">
              <div className="text-4xl font-bold text-accent tracking-tighter">
                {state.progress}%
              </div>
              <div className="text-[11px] text-text-dim mt-2 uppercase tracking-wide">
                {state.processing ? 'Traitement en cours' : 'Prêt pour traitement'}
              </div>
            </div>

            <button
              onClick={startProcessing}
              disabled={state.photos.length === 0 || state.processing}
              className={`
                w-full py-3 rounded-md font-bold text-sm tracking-tight transition-all
                ${state.photos.length > 0 && !state.processing
                  ? 'bg-accent text-black hover:opacity-90'
                  : 'bg-border text-text-dim cursor-not-allowed'}
              `}
            >
              {state.processing ? 'Chargement...' : 'Lancer & Sauvegarder'}
            </button>
          </section>
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="flex justify-end gap-3 pt-2">
        <button 
          onClick={() => setState(p => ({ ...p, photos: [], logo: null, logoPreview: null }))}
          className="text-[11px] font-semibold uppercase px-4 py-2 border border-border rounded hover:bg-white/5 transition-colors"
        >
          Réinitialiser
        </button>
        <div className="w-[1px] bg-border mx-2" />
        <div className="flex items-center text-[11px] text-text-dim gap-2">
          <Settings2 className="w-3.5 h-3.5" />
          Destination : /Export_SnapMark
        </div>
      </footer>
    </div>
  );
}
