"use client";
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface ErrorLayoutProps {
  illustration: string;
  title: string;
  message: string;
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export default function ErrorLayout({
  illustration,
  title,
  message,
  primaryAction,
  secondaryAction
}: ErrorLayoutProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="relative w-64 h-64 mb-8 animate-float">
        <Image
          src={illustration}
          alt="Illustration"
          fill
          className="object-contain"
          priority
        />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
        {title}
      </h1>
      <p className="text-gray-400 max-w-md mb-8 text-lg">
        {message}
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        {primaryAction && (
          primaryAction.href ? (
            <Link
              href={primaryAction.href}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all hover:scale-105 shadow-lg shadow-blue-500/20"
            >
              {primaryAction.label}
            </Link>
          ) : (
            <button
              onClick={primaryAction.onClick}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all hover:scale-105 shadow-lg shadow-blue-500/20"
            >
              {primaryAction.label}
            </button>
          )
        )}
        {secondaryAction && (
          secondaryAction.href ? (
            <Link
              href={secondaryAction.href}
              className="border border-gray-700 hover:border-gray-500 text-gray-300 px-8 py-3 rounded-xl font-bold transition-all"
            >
              {secondaryAction.label}
            </Link>
          ) : (
            <button
              onClick={secondaryAction.onClick}
              className="border border-gray-700 hover:border-gray-500 text-gray-300 px-8 py-3 rounded-xl font-bold transition-all"
            >
              {secondaryAction.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}
