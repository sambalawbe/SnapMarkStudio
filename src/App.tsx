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

interface SavedLogo {
  id: string;
  data: string;
  name: string;
}

interface AppState {
  photos: File[];
  logo: File | null;
  logoPreview: string | null;
  savedLogos: SavedLogo[];
  processing: boolean;
  progress: number;
  config: {
    logoIds: string[];
    logoPosition: Position;
    logoScale: number;
    logoOpacity: number;
    logoMargin: number;
    dateEnabled: boolean;
    datePosition: Position;
    fontSize: number;
    fontColor: string;
    dateFormat: 'current' | 'original';
    customDate: string;
  }
}

const STORAGE_KEY = 'snapmark_settings';
const LOGOS_STORAGE_KEY = 'snapmark_logos';

const DEFAULT_CONFIG = {
  logoPosition: 'bottom-center' as Position,
  logoScale: 4,
  logoOpacity: 0.8,
  logoMargin: 2,
  dateEnabled: true,
  datePosition: 'top-right' as Position,
  fontSize: 32,
  fontColor: '#ffffff',
  dateFormat: 'current' as const,
  customDate: new Date().toISOString().split('T')[0],
  logoIds: [] as string[],
};

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    // Load from localStorage on init
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    const savedLogosJson = localStorage.getItem(LOGOS_STORAGE_KEY);
    let savedLogos: SavedLogo[] = [];
    if (savedLogosJson) {
      try {
        const parsed = JSON.parse(savedLogosJson);
        if (Array.isArray(parsed)) {
          // Deduplicate by ID just in case
          const seen = new Set();
          savedLogos = parsed.filter(logo => {
            if (seen.has(logo.id)) return false;
            seen.add(logo.id);
            return true;
          });
        }
      } catch (e) {
        console.error('Failed to parse saved logos', e);
      }
    }
    
    return {
      photos: [],
      logo: null,
      logoPreview: null,
      savedLogos,
      processing: false,
      progress: 0,
      config: savedConfig ? { ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) } : DEFAULT_CONFIG
    };
  });

  // Handle migration from logoId to logoIds if needed
  useEffect(() => {
    if ((state.config as any).logoId && state.config.logoIds.length === 0) {
      setState(prev => {
        const oldId = (prev.config as any).logoId;
        const newConfig = { ...prev.config, logoIds: [oldId] };
        delete (newConfig as any).logoId;
        return { ...prev, config: newConfig };
      });
    }
  }, []);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }, [state.config]);

  // Persist logos
  useEffect(() => {
    localStorage.setItem(LOGOS_STORAGE_KEY, JSON.stringify(state.savedLogos));
  }, [state.savedLogos]);

  // Handle Default Logo (/logo.png)
  useEffect(() => {
    let isMounted = true;
    const checkDefaultLogo = async () => {
      try {
        const response = await fetch('/logo.png');
        if (response.ok && isMounted) {
          setState(prev => {
            const hasDefault = prev.savedLogos.some(l => l.id === 'default-system-logo');
            if (hasDefault) return prev;

            const newLogo: SavedLogo = {
              id: 'default-system-logo',
              data: '/logo.png',
              name: 'Logo Par Défaut'
            };

            return {
              ...prev,
              savedLogos: [newLogo, ...prev.savedLogos],
              logoPreview: prev.logoPreview || '/logo.png',
              config: { 
                ...prev.config, 
                logoIds: prev.config.logoIds.length === 0 ? ['default-system-logo'] : prev.config.logoIds 
              }
            };
          });
        }
      } catch (e) {
        // Silent fail if logo.png not found
      }
    };
    checkDefaultLogo();
    return () => { isMounted = false; };
  }, []); // Only run once on mount to avoid duplicates

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // Handle Directory Selection
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = (Array.from(e.target.files) as File[])
        .filter(file => file.type.startsWith('image/'))
        .sort((a, b) => a.lastModified - b.lastModified);
      
      setState(prev => ({ ...prev, photos: filesArray }));
    }
  };

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const newLogo: SavedLogo = {
          id: Date.now().toString(),
          data: dataUrl,
          name: file.name
        };
        
        setState(prev => ({ 
          ...prev, 
          logoPreview: dataUrl,
          savedLogos: [newLogo, ...prev.savedLogos].slice(0, 10), // Keep last 10
          config: { ...prev.config, logoIds: [newLogo.id] }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const selectSavedLogo = (logo: SavedLogo) => {
    setState(prev => {
      const isSelected = prev.config.logoIds.includes(logo.id);
      let newLogoIds: string[];
      
      if (isSelected) {
        newLogoIds = prev.config.logoIds.filter(id => id !== logo.id);
      } else {
        // Add to list, max 2
        newLogoIds = [...prev.config.logoIds, logo.id].slice(-2);
      }

      return {
        ...prev,
        config: { ...prev.config, logoIds: newLogoIds }
      };
    });
  };

  const deleteSavedLogo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === 'default-system-logo') return; // Cannot delete system logo
    setState(prev => {
      const newLogos = prev.savedLogos.filter(l => l.id !== id);
      const newLogoIds = prev.config.logoIds.filter(logoId => logoId !== id);
      return {
        ...prev,
        savedLogos: newLogos,
        config: { ...prev.config, logoIds: newLogoIds }
      };
    });
  };

  // Image Processing Logic
  const processImage = useCallback(async (photo: File, logoImgs: HTMLImageElement[], config: typeof state.config): Promise<Blob> => {
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

        // Draw Logo(s)
        if (logoImgs.length > 0) {
          ctx.save();
          ctx.globalAlpha = config.logoOpacity;
          
          const singleLogoScale = config.logoScale;
          const targetWidthPerLogo = (canvas.width * singleLogoScale) / 100;
          const spacing = targetWidthPerLogo * 0.1; // 10% spacing between logos
          
          const totalWidth = logoImgs.length === 1 
            ? targetWidthPerLogo 
            : (targetWidthPerLogo * 2) + spacing;

          // We assume same aspect ratio for simplicity or use the first one's ratio for height
          const firstLogo = logoImgs[0];
          const targetHeight = (firstLogo.height / firstLogo.width) * targetWidthPerLogo;
          const margin = (canvas.width * config.logoMargin) / 100;

          let startX = 0;
          let startY = 0;

          switch (config.logoPosition) {
            case 'top-left': startX = margin; startY = margin; break;
            case 'top-right': startX = canvas.width - totalWidth - margin; startY = margin; break;
            case 'top-center': startX = (canvas.width - totalWidth) / 2; startY = margin; break;
            case 'bottom-left': startX = margin; startY = canvas.height - targetHeight - margin; break;
            case 'bottom-right': startX = canvas.width - totalWidth - margin; startY = canvas.height - targetHeight - margin; break;
            case 'bottom-center': startX = (canvas.width - totalWidth) / 2; startY = canvas.height - targetHeight - margin; break;
            case 'center': startX = (canvas.width - totalWidth) / 2; startY = (canvas.height - targetHeight) / 2; break;
          }

          logoImgs.forEach((logoImg, index) => {
            const x = startX + (index * (targetWidthPerLogo + spacing));
            ctx.drawImage(logoImg, x, startY, targetWidthPerLogo, targetHeight);
          });
          
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
        const logoImgs: HTMLImageElement[] = [];
        
        for (const logoId of state.config.logoIds) {
          const logoData = state.savedLogos.find(l => l.id === logoId)?.data;
          if (logoData) {
            const logoImg = new Image();
            logoImg.src = logoData;
            await new Promise(r => logoImg!.onload = r);
            logoImgs.push(logoImg);
          }
        }

        try {
          const processedBlob = await processImage(state.photos[0], logoImgs, state.config);
          setPreviewSrc(URL.createObjectURL(processedBlob));
        } catch (e) {
          console.error('Preview error:', e);
        }
      };
      updatePreview();
    } else {
      setPreviewSrc(null);
    }
  }, [state.photos, state.savedLogos, state.config, processImage]);

  const startProcessing = async () => {
    if (state.photos.length === 0) return;
    
    setState(prev => ({ ...prev, processing: true, progress: 0 }));
    
    const zip = new JSZip();
    const logoImgs: HTMLImageElement[] = [];

    for (const logoId of state.config.logoIds) {
      const logoData = state.savedLogos.find(l => l.id === logoId)?.data;
      if (logoData) {
        const logoImg = new Image();
        logoImg.src = logoData;
        await new Promise(r => logoImg!.onload = r);
        logoImgs.push(logoImg);
      }
    }

    try {
      for (let i = 0; i < state.photos.length; i++) {
        const photo = state.photos[i];
        const processedBlob = await processImage(photo, logoImgs, state.config);
        // Ajout d'un index numérique pour préserver l'ordre chronologique
        const index = (i + 1).toString().padStart(3, '0');
        zip.file(`${index}_${photo.name}`, processedBlob);
        
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
        <div className="flex items-center gap-4">
          <div className="text-accent text-xl font-bold tracking-tighter">PIXELSTAMP v1.0</div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <span className="text-[10px] text-accent font-bold uppercase tracking-widest">Bot Telegram Actif</span>
          </div>
        </div>
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
                <button className="flex items-center gap-2 text-[11px] font-semibold px-2 py-1 border border-border rounded hover:border-accent hover:text-accent transition-colors">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
            </div>

            {/* Saved Logos Gallery */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none custom-scrollbar group/gallery">
              <div 
                onClick={() => setState(prev => ({ ...prev, config: { ...prev.config, logoIds: [] } }))}
                className={`
                  relative flex-shrink-0 w-12 h-12 rounded-lg border border-dashed cursor-pointer transition-all flex items-center justify-center
                  ${state.config.logoIds.length === 0 ? 'border-accent bg-accent/10' : 'border-border hover:border-text-dim/50'}
                `}
              >
                <X className="w-5 h-5 text-text-dim" />
              </div>

              {state.savedLogos.map((logo) => {
                const selectionIndex = state.config.logoIds.indexOf(logo.id);
                const isSelected = selectionIndex !== -1;
                
                return (
                  <div 
                    key={logo.id}
                    onClick={() => selectSavedLogo(logo)}
                    className={`
                      relative group/item flex-shrink-0 w-12 h-12 rounded-lg border cursor-pointer transition-all p-1
                      ${isSelected ? 'border-accent bg-accent/10 scale-105' : 'border-border hover:border-text-dim/50'}
                    `}
                  >
                    <img src={logo.data} alt={logo.name} className="w-full h-full object-contain" />
                    {logo.id !== 'default-system-logo' && (
                      <button 
                        onClick={(e) => deleteSavedLogo(logo.id, e)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/item:opacity-100 hover:scale-110 transition-all z-20 shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {isSelected && (
                      <div className="absolute -bottom-1 -right-1 bg-accent text-black rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold border-2 border-bg">
                        {state.config.logoIds.length > 1 ? selectionIndex + 1 : <CheckCircle2 className="w-2 h-2" />}
                      </div>
                    )}
                  </div>
                );
              })}
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
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={state.config.logoScale}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoScale: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) } }))}
                      className="w-10 bg-bg border border-border text-[10px] text-center rounded focus:outline-accent"
                    />
                    <span>%</span>
                  </div>
                </div>
                <input 
                  type="range" min="1" max="100" value={state.config.logoScale}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoScale: parseInt(e.target.value) } }))}
                  className="w-full h-1 bg-bg border border-border appearance-none rounded-full accent-accent cursor-pointer"
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
                  <span className="text-sm">Date</span>
                  <input 
                    type="date"
                    value={state.config.customDate}
                    onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, customDate: e.target.value } }))}
                    className="bg-bg border border-border text-[11px] p-1 rounded w-32 focus:outline-accent text-white"
                  />
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
