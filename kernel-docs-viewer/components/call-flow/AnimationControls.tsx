'use client';

import { AnimationState } from '@/types/call-flow';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface AnimationControlsProps {
  animationState: AnimationState;
  onPlay: () => void;
  onPause: () => void;
  onStep: (direction: number) => void;
  onSpeedChange: (speed: number) => void;
}

export default function AnimationControls({
  animationState,
  onPlay,
  onPause,
  onStep,
  onSpeedChange,
}: AnimationControlsProps) {
  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 flex items-center gap-4 z-10">
      {/* Step backward */}
      <button
        onClick={() => onStep(-1)}
        disabled={animationState.currentStep === 0}
        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Step backward"
      >
        <SkipBack className="w-5 h-5" />
      </button>

      {/* Play/Pause */}
      <button
        onClick={animationState.isPlaying ? onPause : onPlay}
        className="p-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        title={animationState.isPlaying ? 'Pause' : 'Play'}
      >
        {animationState.isPlaying ? (
          <Pause className="w-6 h-6" />
        ) : (
          <Play className="w-6 h-6" />
        )}
      </button>

      {/* Step forward */}
      <button
        onClick={() => onStep(1)}
        disabled={animationState.currentStep >= animationState.totalSteps - 1}
        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Step forward"
      >
        <SkipForward className="w-5 h-5" />
      </button>

      {/* Progress indicator */}
      <div className="ml-4 mr-2 text-sm font-mono">
        <span className="font-bold">{animationState.currentStep + 1}</span>
        <span className="text-gray-500"> / </span>
        <span>{animationState.totalSteps}</span>
      </div>

      {/* Speed control */}
      <div className="ml-4 flex items-center gap-2">
        <label className="text-sm text-gray-600 dark:text-gray-400">
          Speed:
        </label>
        <input
          type="range"
          min="500"
          max="2000"
          step="100"
          value={animationState.speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-xs text-gray-500 w-12">
          {(animationState.speed / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
