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
  Maximize2,
  ChevronLeft,
  ChevronRight
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
    textEnabled: boolean;
    textValue: string;
    textPosition: Position;
    textScale: number;
    textOpacity: number;
    textColor: string;
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
  textEnabled: false,
  textValue: '',
  textPosition: 'bottom-left' as Position,
  textScale: 50,
  textOpacity: 0.8,
  textColor: '#ffffff',
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 120,
      damping: 14
    }
  }
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

  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);

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

  // Bounds safety when photos change
  useEffect(() => {
    if (selectedPhotoIndex >= state.photos.length) {
      setSelectedPhotoIndex(Math.max(0, state.photos.length - 1));
    }
  }, [state.photos, selectedPhotoIndex]);

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = (Array.from(e.dataTransfer.files) as File[])
        .filter(file => file.type.startsWith('image/'))
        .sort((a, b) => a.lastModified - b.lastModified);
        
      if (filesArray.length > 0) {
        setState(prev => ({ ...prev, photos: filesArray }));
        setSelectedPhotoIndex(0);
      }
    }
  };

  // Handle Directory Selection
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = (Array.from(e.target.files) as File[])
        .filter(file => file.type.startsWith('image/'))
        .sort((a, b) => a.lastModified - b.lastModified);
      
      if (filesArray.length > 0) {
        setState(prev => ({ ...prev, photos: filesArray }));
        setSelectedPhotoIndex(0);
      }
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

          let dateText = "";
          if (config.dateFormat === 'original') {
            const dObj = new Date(photo.lastModified);
            dateText = dObj.toISOString().split('T')[0];
          } else {
            dateText = config.customDate || new Date().toISOString().split('T')[0];
          }
          // Format YYYY-MM-DD to DD/MM/YYYY for display
          if (dateText.includes('-')) {
            const [y, m, d] = dateText.split('-');
            dateText = `${d}/${m}/${y}`;
          }
          
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

        // Draw Text Watermark
        if (config.textEnabled && config.textValue) {
          ctx.save();
          ctx.globalAlpha = config.textOpacity;
          
          const textFontSize = (canvas.width * config.textScale) / 2000;
          ctx.font = `bold ${textFontSize}px sans-serif`;
          ctx.fillStyle = config.textColor;
          
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;

          const textMetrics = ctx.measureText(config.textValue);
          const textMargin = (canvas.width * 2) / 100;

          let tx = 0;
          let ty = 0;

          switch (config.textPosition) {
            case 'top-left': tx = textMargin; ty = textMargin + textFontSize; break;
            case 'top-right': tx = canvas.width - textMetrics.width - textMargin; ty = textMargin + textFontSize; break;
            case 'top-center': tx = (canvas.width - textMetrics.width) / 2; ty = textMargin + textFontSize; break;
            case 'bottom-left': tx = textMargin; ty = canvas.height - textMargin; break;
            case 'bottom-right': tx = canvas.width - textMetrics.width - textMargin; ty = canvas.height - textMargin; break;
            case 'bottom-center': tx = (canvas.width - textMetrics.width) / 2; ty = canvas.height - textMargin; break;
            case 'center': tx = (canvas.width - textMetrics.width) / 2; ty = (canvas.height + textFontSize) / 2; break;
          }

          ctx.fillText(config.textValue, tx, ty);
          ctx.restore();
        }

        const mimeType = photo.type || 'image/jpeg';
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject('Blob conversion failed');
        }, mimeType, mimeType === 'image/png' ? undefined : 0.9);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(photo);
    });
  }, []);

  // Update Preview
  useEffect(() => {
    let active = true;
    let currentUrl: string | null = null;
    
    if (state.photos.length > 0 && selectedPhotoIndex < state.photos.length) {
      const updatePreview = async () => {
        const logoImgs: HTMLImageElement[] = [];
        
        for (const logoId of state.config.logoIds) {
          const logoData = state.savedLogos.find(l => l.id === logoId)?.data;
          if (logoData) {
            const logoImg = new Image();
            logoImg.src = logoData;
            await new Promise(r => logoImg.onload = r);
            logoImgs.push(logoImg);
          }
        }

        try {
          const currentPhoto = state.photos[selectedPhotoIndex];
          const processedBlob = await processImage(currentPhoto, logoImgs, state.config);
          if (active) {
            const url = URL.createObjectURL(processedBlob);
            currentUrl = url;
            setPreviewSrc(url);
          }
        } catch (e) {
          console.error('Preview error:', e);
        }
      };
      updatePreview();
    } else {
      setPreviewSrc(null);
    }

    return () => {
      active = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [state.photos, selectedPhotoIndex, state.savedLogos, state.config, processImage]);

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
        const baseName = photo.name.substring(0, photo.name.lastIndexOf('.'));
        
        // Ensure proper filename extension matching output format
        const outputMime = photo.type || 'image/jpeg';
        const finalExtension = outputMime === 'image/png' ? '.png' : (outputMime === 'image/webp' ? '.webp' : '.jpg');
        
        zip.file(`${index}_${baseName}${finalExtension}`, processedBlob);
        
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
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen bg-bg text-text p-4 md:p-6 flex flex-col gap-6 max-w-[1440px] mx-auto relative overflow-y-auto custom-scrollbar"
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-bg/85 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4 pointer-events-none border-4 border-dashed border-accent m-4 rounded-xl"
          >
            <Upload className="w-16 h-16 text-accent animate-bounce" />
            <div className="text-xl font-bold uppercase tracking-wider text-accent">Déposez vos photos ici</div>
            <div className="text-xs text-text-dim font-mono">JPG, PNG, WEBP supportés</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex justify-between items-center border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 border border-accent/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.05)]">
            <ImageIcon className="w-5 h-5 text-accent" />
          </div>
          <div className="flex flex-col">
            <div className="text-white text-lg font-extrabold tracking-tight">SnapMark Studio</div>
            <div className="text-xs text-text-dim uppercase tracking-wider font-mono">Filigranes en lot premium</div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 bg-accent/10 border border-accent/20 rounded-full ml-2">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            <span className="text-xs text-accent font-bold uppercase tracking-wider font-mono">Telegram Bot Actif</span>
          </div>
        </div>
        <div className="text-text-dim text-xs font-mono bg-white/5 border border-white/5 px-3 py-1 rounded-lg">
          Session : {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[330px_1fr_290px] gap-6">
        {/* Left Columns: Inputs */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-6 overflow-y-auto pr-1 custom-scrollbar"
        >
          {/* Card 1: Media Source */}
          <motion.section 
            variants={itemVariants}
            className="glass-panel glass-panel-hover rounded-xl p-5 flex flex-col gap-4 shadow-lg transition-all duration-300"
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider">1. Source des médias</h2>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        const filesArray = (Array.from(e.target.files) as File[])
                          .filter(file => file.type.startsWith('image/'))
                          .sort((a, b) => a.lastModified - b.lastModified);
                        if (filesArray.length > 0) {
                          setState(prev => ({ ...prev, photos: filesArray }));
                          setSelectedPhotoIndex(0);
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <button className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 font-semibold py-2 rounded-lg text-sm transition-all active:scale-[0.98] cursor-pointer shadow-sm">
                    Fichiers
                  </button>
                </div>
                <div className="relative flex-1">
                  <input
                    type="file"
                    multiple
                    //@ts-ignore
                    webkitdirectory=""
                    onChange={handleFolderSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <button className="w-full bg-accent text-black font-semibold py-2 rounded-lg text-sm transition-all hover:bg-accent-light active:scale-[0.98] cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                    Dossier
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-lg p-3">
              <div className="text-xs font-mono truncate text-text">
                {state.photos.length > 0 ? `photos/${state.photos[0].webkitRelativePath ? state.photos[0].webkitRelativePath.split('/')[0] : 'fichiers_charges'}` : '/aucun_dossier'}
              </div>
              <div className="text-xs text-text-dim mt-1 font-mono">
                {state.photos.length} images importées
              </div>
            </div>
          </motion.section>

          {/* Card 2: Logo Config */}
          <motion.section 
            variants={itemVariants}
            className="glass-panel glass-panel-hover rounded-xl p-5 flex flex-col gap-4 shadow-lg transition-all duration-300"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider">2. Configuration Logo</h2>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-dim uppercase">Fichier Logo</span>
              <div className="relative">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleLogoUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <button className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:border-accent hover:text-accent transition-all active:scale-[0.95] cursor-pointer">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
            </div>

            {/* Saved Logos Gallery */}
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar group/gallery">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setState(prev => ({ ...prev, config: { ...prev.config, logoIds: [] } }))}
                className={`
                  relative flex-shrink-0 w-12 h-12 rounded-lg border border-dashed cursor-pointer transition-all flex items-center justify-center
                  ${state.config.logoIds.length === 0 ? 'border-accent bg-accent/15' : 'border-white/10 hover:border-white/30'}
                `}
                title="Désactiver le logo"
              >
                <X className="w-5 h-5 text-text-dim" />
              </motion.div>

              <AnimatePresence initial={false}>
                {state.savedLogos.map((logo) => {
                  const selectionIndex = state.config.logoIds.indexOf(logo.id);
                  const isSelected = selectionIndex !== -1;
                  
                  return (
                    <motion.div 
                      key={logo.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => selectSavedLogo(logo)}
                      className={`
                        relative group/item flex-shrink-0 w-12 h-12 rounded-lg border cursor-pointer transition-all p-1 flex items-center justify-center bg-black/20
                        ${isSelected ? 'border-accent bg-accent/10 scale-105 shadow-[0_0_10px_rgba(16,185,129,0.15)]' : 'border-white/10 hover:border-white/30'}
                      `}
                    >
                      <img src={logo.data} alt={logo.name} className="w-full h-full object-contain" />
                      {logo.id !== 'default-system-logo' && (
                        <button 
                          onClick={(e) => deleteSavedLogo(logo.id, e)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/item:opacity-100 hover:scale-110 transition-all z-20 shadow-lg cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                      {isSelected && (
                        <div className="absolute -bottom-1 -right-1 bg-accent text-black rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold border border-bg">
                          {state.config.logoIds.length > 1 ? selectionIndex + 1 : <CheckCircle2 className="w-2.5 h-2.5 text-black" />}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <div className="space-y-4 pt-2 border-t border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-dim uppercase">Position</span>
                <select 
                  value={state.config.logoPosition}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoPosition: e.target.value as Position } }))}
                  className="text-sm p-1.5 rounded-lg w-32 focus:outline-accent text-white"
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
                <div className="flex justify-between text-xs text-text-dim uppercase">
                  <span>Opacité</span>
                  <span>{Math.round(state.config.logoOpacity * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="1" step="0.1" value={state.config.logoOpacity}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoOpacity: parseFloat(e.target.value) } }))}
                  className="w-full cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-text-dim uppercase">
                  <span>Taille</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={state.config.logoScale}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoScale: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) } }))}
                      className="w-10 bg-black/40 border border-white/5 text-xs text-center rounded focus:outline-accent text-white py-0.5"
                    />
                    <span>%</span>
                  </div>
                </div>
                <input 
                  type="range" min="1" max="100" value={state.config.logoScale}
                  onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, logoScale: parseInt(e.target.value) } }))}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
          </motion.section>
        </motion.div>

        {/* Center Column: Preview & File Explorer */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-6"
        >
          {/* Workspace Box */}
          <motion.section 
            variants={itemVariants}
            className="glass-panel rounded-xl relative flex-1 flex items-center justify-center overflow-hidden min-h-[440px] p-6 shadow-xl"
          >
            <AnimatePresence mode="wait">
              {previewSrc ? (
                <motion.div 
                  key={selectedPhotoIndex}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md border border-white/10 text-text px-2.5 py-1 rounded-md text-xs font-mono shadow-md z-20 select-none">
                    {state.photos[selectedPhotoIndex]?.name}
                  </div>
                  
                  <div className="transparency-grid relative rounded-lg border border-white/5 shadow-2xl p-1 overflow-hidden flex items-center justify-center">
                    <img 
                      src={previewSrc} 
                      alt="Aperçu" 
                      className="max-w-full max-h-[58vh] object-contain rounded-md"
                    />
                  </div>

                  {/* Floating navigation overlay */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/85 backdrop-blur-md px-4 py-2 border border-white/10 rounded-full shadow-lg z-20 select-none">
                    <button
                      disabled={state.photos.length <= 1 || selectedPhotoIndex === 0}
                      onClick={() => setSelectedPhotoIndex(p => Math.max(0, p - 1))}
                      className="p-1 rounded-full hover:bg-white/10 text-text disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
                      title="Photo précédente"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-mono px-1">
                      {selectedPhotoIndex + 1} / {state.photos.length}
                    </span>
                    <button
                      disabled={state.photos.length <= 1 || selectedPhotoIndex === state.photos.length - 1}
                      onClick={() => setSelectedPhotoIndex(p => Math.min(state.photos.length - 1, p + 1))}
                      className="p-1 rounded-full hover:bg-white/10 text-text disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
                      title="Photo suivante"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-text-dim/35 select-none">
                  <ImageIcon className="w-12 h-12 text-text-dim/40" />
                  <span className="text-sm uppercase tracking-widest font-bold font-sans">Aucun média chargé</span>
                  <p className="text-xs text-text-dim/60 font-mono text-center max-w-[240px]">
                    Sélectionnez ou glissez-déposez des photos pour commencer
                  </p>
                </div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* File Browser Panel */}
          {state.photos.length > 0 && (
            <motion.div 
              variants={itemVariants}
              className="glass-panel rounded-xl p-4 flex flex-col gap-3 shadow-lg"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-accent" />
                  <span className="text-xs uppercase tracking-wider font-bold text-text-dim">Explorateur de lot ({state.photos.length} fichiers)</span>
                </div>
                <button 
                  onClick={() => {
                    setState(p => ({ ...p, photos: [] }));
                    setSelectedPhotoIndex(0);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Tout vider
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-1">
                <AnimatePresence initial={false}>
                  {state.photos.map((photo, idx) => {
                    const isActive = idx === selectedPhotoIndex;
                    return (
                      <motion.div 
                        key={`${photo.name}_${photo.size}_${photo.lastModified}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => setSelectedPhotoIndex(idx)}
                        className={`
                          flex justify-between items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border
                          ${isActive 
                            ? 'bg-accent/10 border-accent/40 text-white glow-border-active' 
                            : 'bg-black/20 border-transparent hover:bg-white/5 hover:border-white/10 text-text-dim hover:text-text'}
                        `}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ImageIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-accent' : 'text-text-dim/60'}`} />
                          <span className="text-xs font-mono truncate">{photo.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-text-dim font-mono flex-shrink-0">
                            {(photo.size / 1024).toFixed(0)} KB
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setState(prev => {
                                const nextPhotos = prev.photos.filter((_, pIdx) => pIdx !== idx);
                                if (selectedPhotoIndex >= nextPhotos.length) {
                                  setSelectedPhotoIndex(Math.max(0, nextPhotos.length - 1));
                                }
                                return { ...prev, photos: nextPhotos };
                              });
                            }}
                            className="text-text-dim/50 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                            title="Retirer cette photo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Right Column: Date & Action */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-6 overflow-y-auto pr-1 custom-scrollbar"
        >
          {/* Card 3: Timestamp */}
          <motion.section 
            variants={itemVariants}
            className="glass-panel glass-panel-hover rounded-xl p-5 flex flex-col gap-4 shadow-lg transition-all duration-300"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider">3. Horodatage</h2>
              </div>
              <input 
                type="checkbox" 
                checked={state.config.dateEnabled}
                onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, dateEnabled: e.target.checked } }))}
                className="accent-accent w-4 h-4 cursor-pointer"
              />
            </div>

            <AnimatePresence initial={false}>
              {state.config.dateEnabled && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden space-y-4 pt-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-dim uppercase">Source</span>
                    <select 
                      value={state.config.dateFormat}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, dateFormat: e.target.value as 'current' | 'original' } }))}
                      className="text-sm p-1.5 rounded-lg w-32 focus:outline-accent text-white"
                    >
                      <option value="current">Personnalisée</option>
                      <option value="original">Origine</option>
                    </select>
                  </div>

                  {state.config.dateFormat === 'current' ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs text-text-dim uppercase">
                        <span>Date personnalisée</span>
                        <button 
                          onClick={() => setState(prev => ({ ...prev, config: { ...prev.config, customDate: new Date().toISOString().split('T')[0] } }))}
                          className="text-accent hover:text-accent-light lowercase font-semibold transition-colors cursor-pointer"
                        >
                          Aujourd'hui
                        </button>
                      </div>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                        <input 
                          type="date"
                          value={state.config.customDate}
                          onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, customDate: e.target.value } }))}
                          className="w-full text-sm py-2 pl-9 pr-3 rounded-lg focus:outline-accent text-white font-mono"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-text-dim bg-black/40 border border-white/5 rounded-lg p-2.5 font-mono leading-relaxed">
                      Date de modification de l'image (ex: {state.photos.length > 0 && state.photos[selectedPhotoIndex] ? new Date(state.photos[selectedPhotoIndex].lastModified).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}).
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-white/5 pt-3">
                    <span className="text-sm text-text-dim uppercase">Position</span>
                    <select 
                      value={state.config.datePosition}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, datePosition: e.target.value as Position } }))}
                      className="text-sm p-1.5 rounded-lg w-32 focus:outline-accent text-white"
                    >
                      <option value="top-left">Haut-Gauche</option>
                      <option value="top-right">Haut-Droite</option>
                      <option value="top-center">Haut-Milieu</option>
                      <option value="bottom-left">Bas-Gauche</option>
                      <option value="bottom-right">Bas-Droite</option>
                      <option value="bottom-center">Bas-Milieu</option>
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* Card 3b: Filigrane Textuel */}
          <motion.section 
            variants={itemVariants}
            className="glass-panel glass-panel-hover rounded-xl p-5 flex flex-col gap-4 shadow-lg transition-all duration-300"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Layout className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider">3b. Filigrane Textuel</h2>
              </div>
              <input 
                type="checkbox" 
                checked={state.config.textEnabled}
                onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, textEnabled: e.target.checked } }))}
                className="accent-accent w-4 h-4 cursor-pointer"
              />
            </div>

            <AnimatePresence initial={false}>
              {state.config.textEnabled && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden space-y-4 pt-1"
                >
                  <div className="space-y-2">
                    <span className="text-xs text-text-dim uppercase">Texte du filigrane</span>
                    <input 
                      type="text"
                      value={state.config.textValue}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, textValue: e.target.value } }))}
                      placeholder="ex: © 2026 Studio"
                      className="w-full text-sm py-2 px-3 rounded-lg focus:outline-accent text-white"
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-dim uppercase">Position</span>
                    <select 
                      value={state.config.textPosition}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, textPosition: e.target.value as Position } }))}
                      className="text-sm p-1.5 rounded-lg w-32 focus:outline-accent text-white"
                    >
                      <option value="bottom-left">Bas-Gauche</option>
                      <option value="bottom-right">Bas-Droite</option>
                      <option value="bottom-center">Bas-Milieu</option>
                      <option value="top-left">Haut-Gauche</option>
                      <option value="top-right">Haut-Droite</option>
                      <option value="top-center">Haut-Milieu</option>
                      <option value="center">Centre</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-text-dim uppercase">
                      <span>Opacité</span>
                      <span>{Math.round(state.config.textOpacity * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="1" step="0.1" value={state.config.textOpacity}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, textOpacity: parseFloat(e.target.value) } }))}
                      className="w-full cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-text-dim uppercase">
                      <span>Taille</span>
                      <span>{state.config.textScale}</span>
                    </div>
                    <input 
                      type="range" min="10" max="200" step="5" value={state.config.textScale}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, textScale: parseInt(e.target.value) } }))}
                      className="w-full cursor-pointer"
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-dim uppercase">Couleur</span>
                    <input 
                      type="color"
                      value={state.config.textColor}
                      onChange={(e) => setState(prev => ({ ...prev, config: { ...prev.config, textColor: e.target.value } }))}
                      className="bg-transparent border-0 cursor-pointer w-8 h-8 rounded"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* Batch Status */}
          <motion.section 
            variants={itemVariants}
            className="glass-panel glass-panel-hover rounded-xl p-5 flex flex-col gap-4 flex-1 shadow-lg transition-all duration-300"
          >
            <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider">Statut du lot</h2>
            
            <div className="flex-1 flex flex-col justify-center items-center py-4">
              <div className="text-4xl font-extrabold text-accent tracking-tighter glow-accent">
                {state.progress}%
              </div>
              <div className="text-xs text-text-dim mt-2 uppercase tracking-widest font-bold font-sans">
                {state.processing ? 'Traitement...' : 'Prêt'}
              </div>
            </div>

            <button
              onClick={startProcessing}
              disabled={state.photos.length === 0 || state.processing}
              className={`
                w-full py-3 rounded-lg font-bold text-sm tracking-tight transition-all active:scale-[0.98] shadow-md cursor-pointer
                ${state.photos.length > 0 && !state.processing
                  ? 'bg-accent text-black hover:bg-accent-light'
                  : 'bg-white/5 text-text-dim cursor-not-allowed border border-white/5'}
              `}
            >
              {state.processing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  Traitement...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Download className="w-4 h-4 text-black" />
                  Exporter (.zip)
                </span>
              )}
            </button>
          </motion.section>
        </motion.div>
      </main>

      {/* Footer Actions */}
      <footer className="flex justify-between items-center border-t border-white/5 pt-4 mt-2">
        <div className="flex items-center text-xs text-text-dim gap-2 font-mono">
          <Settings2 className="w-3.5 h-3.5 text-accent animate-spin" style={{ animationDuration: '6s' }} />
          Destination : /photos_marquees.zip
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setState(p => ({ ...p, photos: [], logo: null, logoPreview: null }));
              setSelectedPhotoIndex(0);
            }}
            className="text-xs font-bold uppercase tracking-wider px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
          >
            Réinitialiser
          </button>
        </div>
      </footer>
    </div>
  );
}
