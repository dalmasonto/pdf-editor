
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

type ResizeHandleType = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

interface ResizeState {
  annotationId: string;
  handle: ResizeHandleType;
  initialAnnotation: ImageAnnotation;
  initialPageDimensions: { width: number; height: number };
  startX: number; // Mouse clientX at drag start
  startY: number; // Mouse clientY at drag start
  initialPixelWidth: number;
  initialPixelHeight: number;
  initialAnnotationXPercent: number;
  initialAnnotationYPercent: number;
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
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

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
          onPageChange(0); // Or 1 if you prefer, but 0 indicates no valid page
          return;
        }

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        if (currentPage === 0 && pdf.numPages > 0) { // If coming from a no-page state
             onPageChange(1);
        } else if (currentPage > pdf.numPages) { // If current page is out of bounds from previous PDF
            onPageChange(pdf.numPages);
        } else if (currentPage === 0 && pdf.numPages === 0) {
             onPageChange(0); // Stay at 0
        } else if (currentPage < 1 && pdf.numPages > 0) { // Ensure current page is at least 1
            onPageChange(1);
        }
        // otherwise, keep current page if valid
      } catch (error) {
        console.error("Error loading PDF document:", error);
        setPdfLoadingError(`Error loading PDF: ${error instanceof Error ? error.message : String(error)}`);
        setPdfDoc(null);
        setNumPages(0);
        onPageChange(0);
      }
    };
    reader.onerror = (error) => {
      console.error("Error reading file with FileReader:", error);
      setPdfLoadingError("Error reading file. Please ensure it's a valid PDF.");
    };
    reader.readAsArrayBuffer(file);
  }, [file, isPdfjsLibLoaded, setNumPages, onPageChange, currentPage]);


  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || currentPage <= 0 || currentPage > numPages) {
      if (pdfDoc && (currentPage <= 0 || currentPage > numPages) && numPages > 0) {
          setPdfLoadingError(`Cannot render page ${currentPage}: page number is out of range (1-${numPages}).`);
      }
      // Don't clear pageDimensions here if canvas is visible but page num is invalid
      // Keep the last rendered page dimensions or clear if pdfDoc is null
      if(!pdfDoc) setPageDimensions({ width: 0, height: 0 });
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
      setPdfLoadingError(null); 
    } catch (error) {
      console.error(`Error rendering PDF page ${currentPage}:`, error);
      setPdfLoadingError(`Error rendering page ${currentPage}: ${error instanceof Error ? error.message : String(error)}`);
      // setPageDimensions({ width: 0, height: 0 }); // Optionally clear dimensions on error
    }
  }, [pdfDoc, currentPage, scale, numPages]);

  useEffect(() => {
    if (pdfDoc && currentPage > 0 && currentPage <= numPages && isPdfjsLibLoaded) {
      renderPage();
    } else {
        if (!pdfDoc && file && isPdfjsLibLoaded) {
           // Waiting for pdfDoc to load
        } else if (pdfDoc && (currentPage <= 0 || currentPage > numPages) && numPages > 0) {
            // Invalid page number, error already set by renderPage
        } else if (!pdfDoc && !file) {
            setPageDimensions({width: 0, height: 0}); // No file loaded
        }
    }
  }, [pdfDoc, currentPage, numPages, scale, isPdfjsLibLoaded, renderPage, file]);


  const handleAnnotationMouseDown = useCallback((event: React.MouseEvent, annotation: Annotation) => {
    // Prevent drag if resizing is initiated from a handle
    if ((event.target as HTMLElement).dataset.resizeHandle) {
      return;
    }
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

  const handleResizeMouseDown = useCallback((
    event: React.MouseEvent,
    annotation: ImageAnnotation,
    handle: ResizeHandleType
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onAnnotationSelect(annotation.id);

    const annotationElement = viewerRef.current?.querySelector(`[data-annotation-id="${annotation.id}"]`) as HTMLElement;
    if (!annotationElement || !pageDimensions.width || !pageDimensions.height) return;

    const rect = annotationElement.getBoundingClientRect();

    setResizeState({
      annotationId: annotation.id,
      handle,
      initialAnnotation: { ...annotation },
      initialPageDimensions: { ...pageDimensions },
      startX: event.clientX,
      startY: event.clientY,
      initialPixelWidth: rect.width,
      initialPixelHeight: rect.height,
      initialAnnotationXPercent: annotation.x,
      initialAnnotationYPercent: annotation.y,
    });
  }, [onAnnotationSelect, pageDimensions]);

  const handleResizeMouseMove = useCallback((event: MouseEvent) => {
    if (!resizeState || !pageDimensions.width || !pageDimensions.height) return;
    event.preventDefault();

    const {
      annotationId,
      handle,
      initialAnnotation,
      initialPageDimensions,
      startX,
      startY,
      initialPixelWidth,
      initialPixelHeight,
      initialAnnotationXPercent,
      initialAnnotationYPercent,
    } = resizeState;

    const currentAnnotation = annotations.find(a => a.id === annotationId) as ImageAnnotation;
    if (!currentAnnotation) return;
    
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    let newPixelWidth = initialPixelWidth;
    let newPixelHeight = initialPixelHeight;
    let newAnnotationXPercent = initialAnnotationXPercent;
    let newAnnotationYPercent = initialAnnotationYPercent;

    if (handle.includes('Right')) {
      newPixelWidth = initialPixelWidth + deltaX;
    }
    if (handle.includes('Left')) {
      newPixelWidth = initialPixelWidth - deltaX;
      const dxPercentChange = (deltaX / initialPageDimensions.width) * 100;
      newAnnotationXPercent = initialAnnotationXPercent + dxPercentChange;
    }
    if (handle.includes('bottom')) { // "bottom" in "bottomLeft", "bottomRight"
      newPixelHeight = initialPixelHeight + deltaY;
    }
    if (handle.includes('top')) { // "top" in "topLeft", "topRight"
      newPixelHeight = initialPixelHeight - deltaY;
      const dyPercentChange = (deltaY / initialPageDimensions.height) * 100;
      newAnnotationYPercent = initialAnnotationYPercent + dyPercentChange;
    }
    
    // Ensure minimum dimensions (e.g., 20px)
    const minPixelSize = 20;
    newPixelWidth = Math.max(newPixelWidth, minPixelSize);
    newPixelHeight = Math.max(newPixelHeight, minPixelSize);

    // Clamp positions to prevent going off-page with top/left handles
    newAnnotationXPercent = Math.max(0, Math.min(newAnnotationXPercent, 99.9 - (newPixelWidth / initialPageDimensions.width * 100)));
    newAnnotationYPercent = Math.max(0, Math.min(newAnnotationYPercent, 99.9 - (newPixelHeight / initialPageDimensions.height * 100)));


    const finalWidthPercent = (newPixelWidth / initialPageDimensions.width) * 100;
    const finalHeightPercent = (newPixelHeight / initialPageDimensions.height) * 100;

    onAnnotationUpdate({
      ...currentAnnotation,
      x: newAnnotationXPercent,
      y: newAnnotationYPercent,
      width: `${finalWidthPercent.toFixed(2)}%`,
      height: `${finalHeightPercent.toFixed(2)}%`,
    });

  }, [resizeState, annotations, onAnnotationUpdate, pageDimensions]);

  const handleResizeMouseUp = useCallback(() => {
    if (resizeState) {
      setResizeState(null);
    }
  }, [resizeState]);


  useEffect(() => {
    if (draggingAnnotationId) {
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        return () => {
            document.removeEventListener('mousemove', handleDragMove);
            document.removeEventListener('mouseup', handleDragEnd);
        };
    }
    if (resizeState) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup', handleResizeMouseUp);
      };
    }
  }, [draggingAnnotationId, handleDragMove, handleDragEnd, resizeState, handleResizeMouseMove, handleResizeMouseUp]);


  const handleViewerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (draggingAnnotationId || resizeState) return;

    const target = event.target as HTMLElement;
    // Deselect if clicking on viewer bg and not starting a new annotation
    if ((target === viewerRef.current || target === canvasRef.current) && !selectedTool && !target.dataset.resizeHandle) {
        onAnnotationSelect(null);
    }
    
    if (!selectedTool || !viewerRef.current || !pageDimensions.width || !pageDimensions.height || !pdfDoc) return;
    if (target.dataset.resizeHandle) return; // Don't add new annotation if clicking a handle


    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const xRelativeToCanvas = event.clientX - canvasRect.left;
    const yRelativeToCanvas = event.clientY - canvasRect.top;

    const xPercent = (xRelativeToCanvas / canvasRect.width) * 100;
    const yPercent = (yRelativeToCanvas / canvasRect.height) * 100;

    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return; 

    if (selectedTool === 'text') {
      const newAnnotation: Omit<TextAnnotation, 'id'> = {
        type: 'text',
        page: currentPage,
        x: Math.max(0, Math.min(xPercent, 99.9)), 
        y: Math.max(0, Math.min(yPercent, 99.9)),
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
        const targetEl = e.target as HTMLInputElement;
        if (targetEl.files && targetEl.files[0]) {
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            const newAnnotation: Omit<ImageAnnotation, 'id'> = {
              type: 'image',
              page: currentPage,
              x: Math.max(0, Math.min(xPercent, 99.9)),
              y: Math.max(0, Math.min(yPercent, 99.9)),
              width: "25%", 
              height: "15%", 
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

  const renderResizeHandle = (anno: ImageAnnotation, handleType: ResizeHandleType) => {
    let cursorStyle = 'default';
    let positionStyle: React.CSSProperties = {};

    switch (handleType) {
      case 'topLeft':
        cursorStyle = 'nwse-resize';
        positionStyle = { top: '-4px', left: '-4px' };
        break;
      case 'topRight':
        cursorStyle = 'nesw-resize';
        positionStyle = { top: '-4px', right: '-4px' };
        break;
      case 'bottomLeft':
        cursorStyle = 'nesw-resize';
        positionStyle = { bottom: '-4px', left: '-4px' };
        break;
      case 'bottomRight':
        cursorStyle = 'nwse-resize';
        positionStyle = { bottom: '-4px', right: '-4px' };
        break;
    }

    return (
      <div
        data-resize-handle={handleType}
        className="absolute w-3 h-3 bg-primary border border-primary-foreground rounded-full"
        style={{ ...positionStyle, cursor: cursorStyle, zIndex: 10 }}
        onMouseDown={(e) => handleResizeMouseDown(e, anno, handleType)}
      />
    );
  };


  return (
    <div className="relative w-full h-full overflow-auto bg-muted/50 flex justify-center items-center p-4" ref={viewerRef} onClick={handleViewerClick}>
      {!file && <p className="text-muted-foreground">Upload a PDF to start annotating.</p>}
      {file && !isPdfjsLibLoaded && !pdfLoadingError && <p className="text-muted-foreground">Initializing PDF viewer...</p>}
      {pdfLoadingError && <p className="text-destructive px-4 text-center">{pdfLoadingError}</p>}

      {file && isPdfjsLibLoaded && !pdfLoadingError && (
        <>
          {!pdfDoc && !pdfLoadingError && (
            <p className="text-muted-foreground">Loading PDF document...</p>
          )}
          {pdfDoc && (
            <div className="relative flex flex-col items-center justify-center">
              <div
                className="relative shadow-lg bg-white" // Added bg-white for canvas parent
                style={
                  pageDimensions.width > 0 && pageDimensions.height > 0
                    ? { width: pageDimensions.width, height: pageDimensions.height }
                    : { width: 1, height: 1, visibility: 'hidden' } 
                }
              >
                <canvas ref={canvasRef} />
                {pageDimensions.width > 0 && annotationsOnCurrentPage.map((anno) => {
                    const isSelected = selectedAnnotationId === anno.id || draggingAnnotationId === anno.id || resizeState?.annotationId === anno.id;
                    let baseStyle: React.CSSProperties = {
                      position: 'absolute',
                      left: `${anno.x}%`,
                      top: `${anno.y}%`,
                      transform: `rotate(${anno.rotation || 0}deg)`,
                      transformOrigin: 'top left', 
                      border: isSelected ? '2px solid hsl(var(--primary))' : '1px dashed hsl(var(--border))',
                      cursor: draggingAnnotationId === anno.id || resizeState?.annotationId === anno.id ? 'grabbing' : 'move',
                      userSelect: 'none',
                      boxSizing: 'border-box',
                    };

                    if (anno.type === 'text') {
                      const textStyle: React.CSSProperties = {
                        ...baseStyle,
                        width: `${anno.width}%`,
                      };
                      return (
                        <div key={anno.id} style={textStyle} data-ai-hint="text annotation" data-annotation-id={anno.id}
                             onMouseDown={(e) => handleAnnotationMouseDown(e, anno)}>
                          <textarea
                            value={anno.text}
                            onChange={(e) => onAnnotationUpdate({ ...anno, text: e.target.value })}
                            onMouseDown={(e) => e.stopPropagation()} 
                            onClick={(e) => e.stopPropagation()} 
                            style={{
                              width: '100%',
                              fontSize: `${anno.fontSize}px`,
                              fontFamily: anno.fontFamily,
                              color: anno.color,
                              border: 'none',
                              background: 'transparent',
                              resize: 'none', 
                              overflow: 'auto', 
                              padding: '2px',
                              boxSizing: 'border-box',
                              cursor: 'text',
                              minHeight: '20px', 
                            }}
                          />
                        </div>
                      );
                    } else if (anno.type === 'image') {
                       const imageStyle: React.CSSProperties = {
                        ...baseStyle,
                        width: anno.width, 
                        height: anno.height, 
                      };
                      return (
                        <div key={anno.id} style={imageStyle} data-ai-hint="image content" data-annotation-id={anno.id}
                             onMouseDown={(e) => handleAnnotationMouseDown(e, anno)}>
                          <img 
                            src={anno.src} 
                            alt={anno.alt} 
                            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                             />
                          {isSelected && (
                            <>
                              {renderResizeHandle(anno, 'topLeft')}
                              {renderResizeHandle(anno, 'topRight')}
                              {renderResizeHandle(anno, 'bottomLeft')}
                              {renderResizeHandle(anno, 'bottomRight')}
                            </>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>
              {pdfDoc && pageDimensions.width === 0 && currentPage > 0 && currentPage <= numPages && !pdfLoadingError && (
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

