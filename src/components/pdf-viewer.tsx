"use client";

import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Annotation, TextAnnotation, ImageAnnotation } from '@/types';

interface PdfViewerProps {
  file: File | null;
  annotations: Annotation[];
  onAnnotationAdd: (annotation: Omit<Annotation, 'id'>) => void;
  onAnnotationUpdate: (annotation: Annotation) => void;
  onAnnotationDelete: (id: string) => void;
  selectedTool: 'text' | 'image' | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  numPages: number;
  setNumPages: (numPages: number) => void;
  scale: number;
  setScale: (scale: number) => void;
}

const PdfViewer: React.FC<PdfViewerProps> = ({
  file,
  annotations,
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  selectedTool,
  currentPage,
  onPageChange,
  numPages,
  setNumPages,
  scale,
  setScale,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isPdfjsLibLoaded, setIsPdfjsLibLoaded] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      setIsPdfjsLibLoaded(true);
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        setIsPdfjsLibLoaded(true);
      };
      document.body.appendChild(script);
      const workerScript = document.createElement('script');
      workerScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      workerScript.async = true;
      document.body.appendChild(workerScript);
    }
  }, []);

  useEffect(() => {
    if (!file || !isPdfjsLibLoaded) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (!e.target?.result) return;
      const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
      const loadingTask = window.pdfjsLib.getDocument({ data: typedArray });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      onPageChange(1); // Go to first page
    };
    reader.readAsArrayBuffer(file);
  }, [file, isPdfjsLibLoaded, setNumPages, onPageChange]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    setPageDimensions({ width: viewport.width, height: viewport.height });

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const handleViewerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTool || !viewerRef.current || !pageDimensions.width || !pageDimensions.height) return;

    const rect = viewerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / pageDimensions.width) * 100;
    const y = ((event.clientY - rect.top) / pageDimensions.height) * 100;

    if (x < 0 || x > 100 || y < 0 || y > 100) return; // Click outside page boundaries

    if (selectedTool === 'text') {
      const newAnnotation: Omit<TextAnnotation, 'id'> = {
        type: 'text',
        page: currentPage,
        x,
        y,
        width: 20, // default width percentage
        height: 5, // default height percentage
        text: 'New Text',
        fontSize: 12, // in px for rendering, convert to PDF points on save
        fontFamily: 'PT Sans',
        color: '#000000',
        rotation: 0,
      };
      onAnnotationAdd(newAnnotation);
    } else if (selectedTool === 'image') {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            const newAnnotation: Omit<ImageAnnotation, 'id'> = {
              type: 'image',
              page: currentPage,
              x,
              y,
              width: 25, // default width percentage
              height: 15, // default height percentage
              src: loadEvent.target?.result as string,
              alt: 'User image',
              rotation: 0,
            };
            onAnnotationAdd(newAnnotation);
          };
          reader.readAsDataURL(target.files[0]);
        }
      };
      fileInput.click();
    }
  };
  
  return (
    <div className="relative w-full h-full overflow-auto bg-muted/50 flex justify-center items-center p-4" ref={viewerRef} onClick={handleViewerClick}>
      {file && pageDimensions.width > 0 && (
        <div 
          className="relative shadow-lg"
          style={{ width: pageDimensions.width, height: pageDimensions.height }}
        >
          <canvas ref={canvasRef} />
          {annotations
            .filter((anno) => anno.page === currentPage)
            .map((anno) => {
              const style: React.CSSProperties = {
                position: 'absolute',
                left: `${anno.x}%`,
                top: `${anno.y}%`,
                width: `${anno.width}%`,
                height: `${anno.height}%`,
                transform: `rotate(${anno.rotation || 0}deg)`,
                transformOrigin: 'top left',
                border: '1px dashed hsl(var(--primary))', // Highlight annotations
                cursor: 'move',
              };
              if (anno.type === 'text') {
                return (
                  <div key={anno.id} style={style} data-ai-hint="text annotation">
                    <textarea
                      value={anno.text}
                      onChange={(e) => onAnnotationUpdate({ ...anno, text: e.target.value })}
                      onClick={(e) => e.stopPropagation()} // Prevent viewer click
                      style={{
                        width: '100%',
                        height: '100%',
                        fontSize: `${anno.fontSize}px`, // This needs careful scaling for display
                        fontFamily: anno.fontFamily,
                        color: anno.color,
                        border: 'none',
                        background: 'transparent',
                        resize: 'none',
                        overflow: 'hidden',
                        padding: '2px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                );
              } else if (anno.type === 'image') {
                return (
                  <div key={anno.id} style={style} data-ai-hint="image content">
                    <img src={anno.src} alt={anno.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onClick={(e) => e.stopPropagation()} />
                  </div>
                );
              }
              return null;
            })}
        </div>
      )}
      {!file && <p className="text-muted-foreground">Upload a PDF to start annotating.</p>}
    </div>
  );
};

export default PdfViewer;
