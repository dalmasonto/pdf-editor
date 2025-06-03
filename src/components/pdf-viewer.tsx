
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
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
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
  selectedAnnotationId,
  onAnnotationSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isPdfjsLibLoaded, setIsPdfjsLibLoaded] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pdfLoadingError, setPdfLoadingError] = useState<string | null>(null);

  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      setIsPdfjsLibLoaded(true);
    } else if (typeof window !== 'undefined') {
      console.warn('PDF.js library (window.pdfjsLib) not found on component mount.');
      setPdfLoadingError("PDF viewer library failed to load. Please try refreshing the page.");
    }
  }, []);

  useEffect(() => {
    if (!file || !isPdfjsLibLoaded) {
      setPdfDoc(null);
      setNumPages(0);
      setPageDimensions({ width: 0, height: 0 });
      if (!file || (file && !isPdfjsLibLoaded && !pdfLoadingError?.includes("library failed to load"))) {
        setPdfLoadingError(null);
      }
      if (file && !isPdfjsLibLoaded && !pdfLoadingError) {
         setPdfLoadingError("PDF viewer library is not ready.");
      }
      return;
    }

    setPdfLoadingError(null);
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

        if (pdf.numPages === 0) {
          setPdfLoadingError("The PDF document has no pages.");
          setPdfDoc(null);
          setNumPages(0);
          onPageChange(0);
          return;
        }

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        onPageChange(1); // Reset to first page
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
  }, [file, isPdfjsLibLoaded, setNumPages, onPageChange]);


  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || currentPage <= 0 || currentPage > pdfDoc.numPages) {
      if (pdfDoc && (currentPage <= 0 || currentPage > pdfDoc.numPages)) {
          setPdfLoadingError(`Cannot render page ${currentPage}: page number is out of range (1-${pdfDoc.numPages}).`);
      }
      setPageDimensions({ width: 0, height: 0 }); // Ensure this is reset if conditions fail
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
        setPageDimensions({ width: 0, height: 0 });
        return;
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      await page.render(renderContext).promise;
      setPageDimensions({ width: viewport.width, height: viewport.height });
      setPdfLoadingError(null); // Clear previous errors on successful render
    } catch (error) {
      console.error(`Error rendering PDF page ${currentPage}:`, error);
      setPdfLoadingError(`Error rendering page ${currentPage}: ${error instanceof Error ? error.message : String(error)}`);
      setPageDimensions({ width: 0, height: 0 });
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    if (pdfDoc && currentPage > 0 && isPdfjsLibLoaded) {
      renderPage();
    } else {
        // If pdfDoc is null or currentPage is invalid, reflect that in pageDimensions
        if (!pdfDoc && file && isPdfjsLibLoaded) {
            // Waiting for pdfDoc to load
        } else {
            setPageDimensions({ width: 0, height: 0 });
        }
    }
  }, [pdfDoc, currentPage, scale, isPdfjsLibLoaded, renderPage, file]);

  const handleAnnotationMouseDown = useCallback((event: React.MouseEvent, annotation: Annotation) => {
    event.preventDefault();
    event.stopPropagation();

    onAnnotationSelect(annotation.id);

    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();

    const clickXCanvasPercent = ((event.clientX - canvasRect.left) / canvasRect.width) * 100;
    const clickYCanvasPercent = ((event.clientY - canvasRect.top) / canvasRect.height) * 100;

    setDragStartOffset({
        x: clickXCanvasPercent - annotation.x,
        y: clickYCanvasPercent - annotation.y,
    });
    setDraggingAnnotationId(annotation.id);
  }, [onAnnotationSelect, canvasRef]);

  const handleDragMove = useCallback((event: MouseEvent) => {
    if (!draggingAnnotationId || !dragStartOffset || !canvasRef.current || !viewerRef.current) return;

    const currentAnnotation = annotations.find(a => a.id === draggingAnnotationId);
    if (!currentAnnotation) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    const mouseXOnCanvas = event.clientX - canvasRect.left;
    const mouseYOnCanvas = event.clientY - canvasRect.top;

    let newX = (mouseXOnCanvas / canvasRect.width) * 100 - dragStartOffset.x;
    let newY = (mouseYOnCanvas / canvasRect.height) * 100 - dragStartOffset.y;

    // Clamp x and y to be within [0, 99.9] to keep top-left corner mostly on page
    newX = Math.max(0, Math.min(newX, 99.9));
    newY = Math.max(0, Math.min(newY, 99.9));

    onAnnotationUpdate({
        ...currentAnnotation,
        x: newX,
        y: newY,
    });
  }, [draggingAnnotationId, dragStartOffset, annotations, onAnnotationUpdate, canvasRef, viewerRef]);

  const handleDragEnd = useCallback(() => {
    if (draggingAnnotationId) {
        setDraggingAnnotationId(null);
        setDragStartOffset(null);
    }
  }, [draggingAnnotationId]);

  useEffect(() => {
    if (draggingAnnotationId) {
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        return () => {
            document.removeEventListener('mousemove', handleDragMove);
            document.removeEventListener('mouseup', handleDragEnd);
        };
    }
  }, [draggingAnnotationId, handleDragMove, handleDragEnd]);


  const handleViewerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (draggingAnnotationId) return;

    const target = event.target as HTMLElement;
    // Deselect annotation if clicking on viewer background and not on a tool
    if ((target === viewerRef.current || target === canvasRef.current) && !selectedTool) {
        onAnnotationSelect(null);
    }
    
    if (!selectedTool || !viewerRef.current || !pageDimensions.width || !pageDimensions.height || !pdfDoc) return;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const xRelativeToCanvas = event.clientX - canvasRect.left;
    const yRelativeToCanvas = event.clientY - canvasRect.top;

    // Click coordinates as percentage of canvas
    const xPercent = (xRelativeToCanvas / canvasRect.width) * 100;
    const yPercent = (yRelativeToCanvas / canvasRect.height) * 100;

    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return; // Click outside canvas bounds

    if (selectedTool === 'text') {
      const newAnnotation: Omit<TextAnnotation, 'id'> = {
        type: 'text',
        page: currentPage,
        x: Math.max(0, Math.min(xPercent, 99.9)), // Clamp initial position
        y: Math.max(0, Math.min(yPercent, 99.9)),
        width: 20, // Default percentage width
        height: 5, // Default percentage height
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
        const targetEl = e.target as HTMLInputElement;
        if (targetEl.files && targetEl.files[0]) {
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            const newAnnotation: Omit<ImageAnnotation, 'id'> = {
              type: 'image',
              page: currentPage,
              x: Math.max(0, Math.min(xPercent, 99.9)), // Clamp initial position
              y: Math.max(0, Math.min(yPercent, 99.9)),
              width: "25%", // Default string width
              height: "15%", // Default string height
              src: loadEvent.target?.result as string,
              alt: 'User image',
              rotation: 0,
            };
            onAnnotationAdd(newAnnotation);
          };
          reader.readAsDataURL(targetEl.files[0]);
        }
      };
      fileInput.click();
    }
  };

  const annotationsOnCurrentPage = annotations.filter((anno) => anno.page === currentPage);

  return (
    <div className="relative w-full h-full overflow-auto bg-muted/50 flex justify-center items-center p-4" ref={viewerRef} onClick={handleViewerClick}>
      {!file && <p className="text-muted-foreground">Upload a PDF to start annotating.</p>}
      {file && !isPdfjsLibLoaded && !pdfLoadingError && <p className="text-muted-foreground">Initializing PDF viewer...</p>}
      {pdfLoadingError && <p className="text-destructive px-4 text-center">{pdfLoadingError}</p>}

      {file && isPdfjsLibLoaded && !pdfLoadingError && (
        <>
          {!pdfDoc && (
            <p className="text-muted-foreground">Loading PDF document...</p>
          )}
          {/* Render canvas container once pdfDoc is available, even if pageDimensions are not set yet */}
          {pdfDoc && (
            <div className="relative flex flex-col items-center justify-center">
              <div
                className="relative shadow-lg"
                style={
                  // Use pageDimensions to set size, but ensure it's always in DOM if pdfDoc exists
                  pageDimensions.width > 0 && pageDimensions.height > 0
                    ? { width: pageDimensions.width, height: pageDimensions.height }
                    : { width: 1, height: 1, visibility: 'hidden' } // Keep in DOM but hidden if not rendered
                }
              >
                <canvas ref={canvasRef} />
                {pageDimensions.width > 0 && annotationsOnCurrentPage.map((anno) => {
                    const isSelected = selectedAnnotationId === anno.id || draggingAnnotationId === anno.id;
                    const baseStyle: React.CSSProperties = {
                      position: 'absolute',
                      left: `${anno.x}%`,
                      top: `${anno.y}%`,
                      transform: `rotate(${anno.rotation || 0}deg)`,
                      transformOrigin: 'top left', // Rotation origin
                      border: isSelected ? '2px solid hsl(var(--primary))' : '1px dashed hsl(var(--border))',
                      cursor: 'move',
                      userSelect: 'none',
                      boxSizing: 'border-box',
                    };

                    if (anno.type === 'text') {
                      const textStyle: React.CSSProperties = {
                        ...baseStyle,
                        width: `${anno.width}%`,
                        height: `${anno.height}%`,
                      };
                      return (
                        <div key={anno.id} style={textStyle} data-ai-hint="text annotation"
                             onMouseDown={(e) => handleAnnotationMouseDown(e, anno)}>
                          <textarea
                            value={anno.text}
                            onChange={(e) => onAnnotationUpdate({ ...anno, text: e.target.value })}
                            onMouseDown={(e) => e.stopPropagation()} 
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
                              cursor: 'text',
                            }}
                          />
                        </div>
                      );
                    } else if (anno.type === 'image') {
                       const imageStyle: React.CSSProperties = {
                        ...baseStyle,
                        width: anno.width, // Uses string value directly e.g. "100px" or "25%"
                        height: anno.height, // Uses string value directly
                      };
                      return (
                        <div key={anno.id} style={imageStyle} data-ai-hint="image content"
                             onMouseDown={(e) => handleAnnotationMouseDown(e, anno)}>
                          <img 
                            src={anno.src} 
                            alt={anno.alt} 
                            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                            onClick={(e) => e.stopPropagation()} />
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>
              {pdfDoc && pageDimensions.width === 0 && currentPage > 0 && !pdfLoadingError && (
                <p className="text-muted-foreground absolute">Rendering page {currentPage}...</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PdfViewer;
