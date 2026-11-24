'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Hammer, Flame } from 'lucide-react';
import { Cormorant_Garamond, Montserrat } from 'next/font/google';
import { supabase } from '@/src/lib/supabase';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700', '500'],
  style: ['normal', 'italic'],
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export interface HeroData {
  bgImage: string;
  videoUrl?: string;
  tituloLinha1: string;
  tituloDestaque: string;
  subtitulo: string;
}

interface HeroProps {
  data?: HeroData;
}

// Identifica se a URL aponta para um arquivo de vídeo (mesmo com query params do Supabase Storage)
const isVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].trim().toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v|mkv|avi)$/i.test(cleanUrl);
};

export const Hero: React.FC<HeroProps> = ({ data: initialData }) => {
  const [heroData, setHeroData] = useState<HeroData | null>(initialData || null);
  const [isLoaded, setIsLoaded] = useState(Boolean(initialData));
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sincroniza caso o componente pai (app/page.tsx) atualize a prop data
  useEffect(() => {
    if (initialData) {
      setHeroData(initialData);
      setIsLoaded(true);
    }
  }, [initialData]);

  useEffect(() => {
    let isMounted = true;

    const fetchActiveBanner = async () => {
      try {
        const { data, error } = await supabase
          .from('banners_hero')
          .select('imagem_url, titulo_linha1, titulo_destaque, subtitulo')
          .eq('ativo', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Erro ao buscar banner ativo do Hero:', error.message);
          return;
        }

        if (isMounted && data) {
          setVideoFailed(false);
          setIsVideoReady(false);
          setHeroData({
            bgImage: data.imagem_url || '',
            tituloLinha1: data.titulo_linha1 || '',
            tituloDestaque: data.titulo_destaque || '',
            subtitulo: data.subtitulo || '',
          });
        }
      } catch (err) {
        console.error('Erro ao procurar o banner ativo do Hero:', err);
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    };

    fetchActiveBanner();

    return () => {
      isMounted = false;
    };
  }, []);

  // Resolve qual mídia exibir (suporta vídeo direto em bgImage/imagem_url ou em videoUrl separado)
  const { activeVideoUrl, activePosterOrBgImage, shouldRenderVideo } = useMemo(() => {
    const rawVideo =
      heroData?.videoUrl?.trim() ||
      (isVideoUrl(heroData?.bgImage) ? heroData?.bgImage?.trim() : '');
    const rawImage = !isVideoUrl(heroData?.bgImage) ? heroData?.bgImage?.trim() : '';

    return {
      activeVideoUrl: rawVideo || '',
      activePosterOrBgImage: rawImage || '',
      shouldRenderVideo: Boolean(rawVideo) && !videoFailed,
    };
  }, [heroData, videoFailed]);

  // Força a reprodução imediata do vídeo no navegador (contorna o bloqueio de autoplay do React/Chrome)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!shouldRenderVideo || !videoEl || !activeVideoUrl) return;

    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;

    const startPlayback = async () => {
      try {
        await videoEl.play();
        setIsVideoReady(true);
      } catch {
        // Caso o navegador exija aguardar o buffer inicial, o onCanPlay assumirá
      }
    };

    void startPlayback();
  }, [shouldRenderVideo, activeVideoUrl]);

  const mediaVisible = shouldRenderVideo
    ? isLoaded && (isVideoReady || Boolean(activePosterOrBgImage))
    : isLoaded && Boolean(activePosterOrBgImage);

  return (
    <section className="relative w-full h-[85vh] min-h-[650px] flex flex-col justify-center overflow-hidden bg-slate-950">
      {/* Mídia de Fundo (Vídeo ou Imagem) com Efeito Cinematográfico */}
      {shouldRenderVideo ? (
        <video
          ref={videoRef}
          key={activeVideoUrl}
          src={activeVideoUrl}
          poster={activePosterOrBgImage || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            el.muted = true;
            void el.play().catch(() => {});
            setIsVideoReady(true);
          }}
          onCanPlay={(e) => {
            const el = e.currentTarget;
            el.muted = true;
            void el.play().catch(() => {});
            setIsVideoReady(true);
          }}
          onError={() => setVideoFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ease-out transform pointer-events-none ${
            mediaVisible ? 'opacity-50 scale-100' : 'opacity-0 scale-105'
          }`}
        />
      ) : (
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ease-out transform ${
            mediaVisible ? 'opacity-50 scale-100' : 'opacity-0 scale-105'
          }`}
          style={
            activePosterOrBgImage
              ? { backgroundImage: `url("${encodeURI(activePosterOrBgImage)}")` }
              : undefined
          }
        />
      )}

      {/* Gradiente de Sobreposição */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent pointer-events-none" />

      {/* Conteúdo Principal com Entrada Suave */}
      <div
        className={`relative z-10 w-full px-6 md:px-12 lg:px-20 flex flex-col items-start pt-40 transition-all duration-700 ease-out delay-150 transform ${
          isLoaded && heroData ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {heroData && (
          <>
            <h1
              className={`${cormorant.className} italic text-6xl md:text-7xl lg:text-[5.5rem] font-bold text-white leading-[1.1] mb-6 max-w-4xl tracking-wide`}
            >
              {heroData.tituloLinha1} <br />
              <span className="text-amber-500">{heroData.tituloDestaque}</span>
            </h1>

            <p
              className={`${montserrat.className} text-slate-300 text-sm md:text-base leading-relaxed max-w-xl mb-12`}
            >
              {heroData.subtitulo}
            </p>
          </>
        )}
      </div>

      {/* Barra de Atributos fixa no rodapé */}
      <div className="absolute bottom-0 left-0 w-full border-t border-slate-800/50 bg-slate-950/60 backdrop-blur-sm py-5 z-20">
        <div className="w-full px-6 md:px-12 lg:px-20 flex flex-wrap justify-center gap-8 md:gap-16">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-300">
              Resistência Extrema
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Hammer className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-300">
              100% Artesanal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Flame className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-300">
              Fé Inabalável
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};