
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
  const [pdfLoadingError, setPdfLoadingError] = useState<string | null>(null);

  useEffect(() => {
    // PDF.js library and worker are expected to be loaded by src/app/layout.tsx
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      console.log('PDF.js library found, setting workerSrc.');
      // Ensure workerSrc is set. This path should match the one in layout.tsx or be a CDN link.
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      setIsPdfjsLibLoaded(true);
    } else if (typeof window !== 'undefined') {
      console.warn('PDF.js library (window.pdfjsLib) not found on component mount. Ensure it is loaded globally in layout.tsx.');
      setPdfLoadingError("PDF viewer library failed to load. Please try refreshing the page.");
    }
  }, []);

  useEffect(() => {
    if (!file || !isPdfjsLibLoaded) {
      // Reset PDF doc and dimensions if file or library is not available
      setPdfDoc(null);
      setNumPages(0);
      setPageDimensions({ width: 0, height: 0 });
      setPdfLoadingError(null); // Clear previous errors if file is removed
      if (file && !isPdfjsLibLoaded && !pdfLoadingError) {
         setPdfLoadingError("PDF viewer library is not ready.");
      }
      return;
    }
    setPdfLoadingError(null); // Clear previous errors
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (!e.target?.result) {
        setPdfLoadingError("Failed to read file.");
        return;
      }
      const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
      try {
        const loadingTask = window.pdfjsLib.getDocument({ data: typedArray });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        onPageChange(1); // Go to first page
      } catch (error) {
        console.error("Error loading PDF document:", error);
        setPdfLoadingError(`Error loading PDF: ${error instanceof Error ? error.message : String(error)}`);
        setPdfDoc(null);
        setNumPages(0);
      }
    };
    reader.onerror = (error) => {
      console.error("Error reading file with FileReader:", error);
      setPdfLoadingError("Error reading file. Please ensure it's a valid PDF.");
    };
    reader.readAsArrayBuffer(file);
  }, [file, isPdfjsLibLoaded, setNumPages, onPageChange]); // Removed pdfLoadingError from deps to avoid loops

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    if (currentPage > pdfDoc.numPages || currentPage < 1) {
        console.warn(`Attempted to render invalid page number: ${currentPage}`);
        return;
    }
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) {
        console.error("Failed to get 2D context from canvas.");
        setPdfLoadingError("Failed to initialize canvas for PDF rendering.");
        return;
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setPageDimensions({ width: viewport.width, height: viewport.height });

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      await page.render(renderContext).promise;
      setPdfLoadingError(null); // Clear error on successful render
    } catch (error) {
      console.error("Error rendering PDF page:", error);
      setPdfLoadingError(`Error rendering page ${currentPage}: ${error instanceof Error ? error.message : String(error)}`);
      // Optionally clear canvas or show error placeholder on canvas
      // setPageDimensions({ width: 0, height: 0 }); // Reset dimensions on error to hide broken canvas
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPage();
    }
  }, [renderPage, pdfDoc, currentPage]); // Ensure renderPage is stable or dependencies are correct


  const handleViewerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTool || !viewerRef.current || !pageDimensions.width || !pageDimensions.height || !pdfDoc) return;

    const rect = viewerRef.current.getBoundingClientRect();
    // Ensure calculations are relative to the scaled PDF page displayed on canvas
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const xRelativeToCanvas = event.clientX - canvasRect.left;
    const yRelativeToCanvas = event.clientY - canvasRect.top;

    // Convert to percentage based on actual canvas dimensions
    const x = (xRelativeToCanvas / canvasRect.width) * 100;
    const y = (yRelativeToCanvas / canvasRect.height) * 100;


    if (x < 0 || x > 100 || y < 0 || y > 100) return; // Click outside page boundaries

    if (selectedTool === 'text') {
      const newAnnotation: Omit<TextAnnotation, 'id'> = {
        type: 'text',
        page: currentPage,
        x,
        y,
        width: 20, 
        height: 5, 
        text: 'New Text',
        fontSize: 12, 
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
              width: 25, 
              height: 15,
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
      {!file && <p className="text-muted-foreground">Upload a PDF to start annotating.</p>}
      {file && !isPdfjsLibLoaded && !pdfLoadingError && <p className="text-muted-foreground">Initializing PDF viewer...</p>}
      {pdfLoadingError && <p className="text-destructive px-4 text-center">{pdfLoadingError}</p>}
      
      {file && isPdfjsLibLoaded && !pdfLoadingError && !pdfDoc && <p className="text-muted-foreground">Loading PDF document...</p>}
      
      {file && pdfDoc && !pdfLoadingError && pageDimensions.width === 0 && currentPage > 0 && <p className="text-muted-foreground">Rendering page {currentPage}...</p>}

      {file && pdfDoc && !pdfLoadingError && pageDimensions.width > 0 && (
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
                border: '1px dashed hsl(var(--primary))',
                cursor: 'move', // This might be better on a selected state
              };
              if (anno.type === 'text') {
                return (
                  <div key={anno.id} style={style} data-ai-hint="text annotation">
                    <textarea
                      value={anno.text}
                      onChange={(e) => onAnnotationUpdate({ ...anno, text: e.target.value })}
                      onClick={(e) => e.stopPropagation()} 
                      style={{
                        width: '100%',
                        height: '100%',
                        fontSize: `${anno.fontSize}px`, 
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
    </div>
  );
};

export default PdfViewer;

    