import React, { useEffect, useRef, useState } from 'react';
const LoadingPage = () => {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <video
        className="max-w-full max-h-full w-auto h-auto object-contain"
        autoPlay
        muted
        playsInline
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      >
        <source src="/logo-video-cutter.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};
export const LoadingPage_LoadingPage = LoadingPage;
