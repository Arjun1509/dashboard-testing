import React, { useState } from 'react';

interface PixelAssetProps {
  src: string;
  alt: string;
  className?: string;
  aspectClass?: string;
  label?: string;
}

export const PixelAsset: React.FC<PixelAssetProps> = ({
  src,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
  label = 'SwapSched Pixel Graphic',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`relative w-full ${aspectClass} bg-[#EBE8DF] border border-[#141513] pixel-grid-bg flex flex-col items-center justify-center p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 16 16"
          className="mb-3 pixelated"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="10" height="10" fill="#141513" />
          <rect x="12" y="6" width="2" height="4" fill="#141513" />
          <rect x="3" y="4" width="8" height="8" fill="#F4F2EC" />
          <rect x="4" y="5" width="2" height="6" fill="#B8FF2E" />
          <rect x="7" y="5" width="2" height="6" fill="#7B68EE" />
        </svg>
        <span className="font-mono-tech text-xs font-medium text-[#141513]">{label}</span>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden bg-[#F4F2EC] ${aspectClass} ${className}`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover pixelated block"
      />
    </div>
  );
};
