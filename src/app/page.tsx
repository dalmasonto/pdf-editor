
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Annotation, TextAnnotation, ImageAnnotation } from '@/types';
import PdfViewer from '@/components/pdf-viewer';
import AnnotationSidebar from '@/components/annotation-sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { FileUp, Type, ImagePlus, Download, ZoomIn, ZoomOut, ArrowLeft, ArrowRight, RotateCcw, RotateCw } from 'lucide-react';

export default function AnnotatePdfPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedTool, setSelectedTool] = useState<'text' | 'image' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setAnnotations([]); // Reset annotations for new file
      setCurrentPage(1);
      setScale(1.0);
      setSelectedTool(null);
      setSelectedAnnotationId(null);
      toast({ title: "PDF Loaded", description: `${file.name} has been loaded.` });
    } else {
      toast({ title: "Invalid File", description: "Please upload a valid PDF file.", variant: "destructive" });
    }
  };

  const addAnnotation = useCallback((newAnnotationData: Omit<Annotation, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2,9);
    const newAnnotation = { ...newAnnotationData, id };
    setAnnotations((prev) => [...prev, newAnnotation]);
    setSelectedTool(null); // Deselect tool after adding
    setSelectedAnnotationId(id); // Select the new annotation
  }, []);

  const updateAnnotation = useCallback((updatedAnnotation: Annotation) => {
    setAnnotations((prev) =>
      prev.map((anno) => (anno.id === updatedAnnotation.id ? updatedAnnotation : anno))
    );
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((anno) => anno.id !== id));
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId]);

  const handleDownload = async () => {
    if (!pdfFile) {
      toast({ title: "No PDF", description: "Please upload a PDF file first.", variant: "destructive" });
      return;
    }

    try {
      const existingPdfBytes = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica); // Default font

      for (const anno of annotations) {
        const page = pdfDoc.getPage(anno.page - 1); // pdf-lib is 0-indexed
        const { width: pageWidth, height: pageHeight } = page.getSize();

        // Convert percentage to PDF points
        // PDF Y is from bottom-left, HTML Y is from top-left
        const annoX = (anno.x / 100) * pageWidth;
        let annoYBase = (anno.y / 100) * pageHeight;
        const annoWidth = (anno.width / 100) * pageWidth;
        const annoHeight = (anno.height / 100) * pageHeight;
        const annoY = pageHeight - annoYBase - annoHeight; // Adjust Y for pdf-lib

        if (anno.type === 'text') {
          // Basic color parsing
          const colorString = anno.color.startsWith('#') ? anno.color.substring(1) : anno.color;
          const r = parseInt(colorString.substring(0, 2), 16) / 255;
          const g = parseInt(colorString.substring(2, 4), 16) / 255;
          const b = parseInt(colorString.substring(4, 6), 16) / 255;
          
          page.drawText(anno.text, {
            x: annoX,
            y: annoY + annoHeight - anno.fontSize, // Adjust y for text baseline
            size: anno.fontSize,
            font: helveticaFont,
            color: rgb(r, g, b),
            lineHeight: anno.fontSize * 1.2,
            maxWidth: annoWidth,
            rotate: degrees(anno.rotation || 0),
          });
        } else if (anno.type === 'image') {
          try {
            let imageBytes: ArrayBuffer;
            if (anno.src.startsWith('data:image')) {
              const base64Data = anno.src.split(',')[1];
              imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
            } else {
              const response = await fetch(anno.src);
              imageBytes = await response.arrayBuffer();
            }
            
            let pdfImage;
            if (anno.src.includes('png')) {
              pdfImage = await pdfDoc.embedPng(imageBytes);
            } else if (anno.src.includes('jpeg') || anno.src.includes('jpg')) {
              pdfImage = await pdfDoc.embedJpg(imageBytes);
            } else {
              console.warn(`Unsupported image type for annotation ${anno.id}`);
              continue;
            }
            
            page.drawImage(pdfImage, {
              x: annoX,
              y: annoY,
              width: annoWidth,
              height: annoHeight,
              rotate: degrees(anno.rotation || 0),
            });
          } catch (error) {
            console.error(`Failed to embed image for annotation ${anno.id}:`, error);
            toast({ title: "Image Error", description: `Could not embed image: ${anno.alt}`, variant: "destructive" });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${pdfFile.name.replace('.pdf', '')}_annotated.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Download Started", description: "Your annotated PDF is downloading." });
    } catch (error) {
      console.error("Failed to save PDF:", error);
      toast({ title: "Download Failed", description: "Could not generate the annotated PDF.", variant: "destructive" });
    }
  };
  
  const handleAnnotationRotation = (direction: 'cw' | 'ccw') => {
    if (!selectedAnnotationId) return;
    const annotation = annotations.find(a => a.id === selectedAnnotationId);
    if (annotation) {
      const currentRotation = annotation.rotation || 0;
      const newRotation = direction === 'cw' ? (currentRotation + 15) % 360 : (currentRotation - 15 + 360) % 360;
      updateAnnotation({ ...annotation, rotation: newRotation });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="p-4 border-b bg-card shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-headline text-primary">AnnotatePDF</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
              ref={fileInputRef}
              id="pdf-upload"
            />
            <Button onClick={() => fileInputRef.current?.click()} variant="outline">
              <FileUp className="mr-2 h-4 w-4" /> Upload PDF
            </Button>
            <Button
              variant={selectedTool === 'text' ? 'default' : 'outline'}
              onClick={() => setSelectedTool(selectedTool === 'text' ? null : 'text')}
              disabled={!pdfFile}
            >
              <Type className="mr-2 h-4 w-4" /> Add Text
            </Button>
            <Button
              variant={selectedTool === 'image' ? 'default' : 'outline'}
              onClick={() => setSelectedTool(selectedTool === 'image' ? null : 'image')}
              disabled={!pdfFile}
            >
              <ImagePlus className="mr-2 h-4 w-4" /> Add Image
            </Button>
            <Button onClick={handleDownload} disabled={!pdfFile}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-grow flex overflow-hidden">
        <main className="flex-grow flex flex-col p-0 m-0 h-full">
          {pdfFile && (
            <div className="bg-muted/30 p-2 border-b flex items-center justify-center gap-4 print:hidden">
              <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} variant="ghost" size="icon"><ArrowLeft /></Button>
              <span className="text-sm font-medium">Page {currentPage} of {numPages}</span>
              <Button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages} variant="ghost" size="icon"><ArrowRight /></Button>
              <Button onClick={() => setScale(s => Math.max(0.25, s - 0.25))} variant="ghost" size="icon"><ZoomOut /></Button>
              <Slider
                value={[scale]}
                min={0.25} max={3} step={0.01}
                onValueChange={(value) => setScale(value[0])}
                className="w-32"
                aria-label="Zoom slider"
              />
              <Button onClick={() => setScale(s => Math.min(3, s + 0.25))} variant="ghost" size="icon"><ZoomIn /></Button>
              {selectedAnnotationId && (
                <>
                  <Button onClick={() => handleAnnotationRotation('ccw')} variant="ghost" size="icon" title="Rotate Counter-Clockwise"><RotateCcw /></Button>
                  <Button onClick={() => handleAnnotationRotation('cw')} variant="ghost" size="icon" title="Rotate Clockwise"><RotateCw /></Button>
                </>
              )}
            </div>
          )}
          <PdfViewer
            file={pdfFile}
            annotations={annotations}
            onAnnotationAdd={addAnnotation}
            onAnnotationUpdate={updateAnnotation}
            onAnnotationDelete={deleteAnnotation}
            selectedTool={selectedTool}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            numPages={numPages}
            setNumPages={setNumPages}
            scale={scale}
            setScale={setScale}
            selectedAnnotationId={selectedAnnotationId}
            onAnnotationSelect={setSelectedAnnotationId}
          />
        </main>
        <AnnotationSidebar
          annotations={annotations}
          onAnnotationUpdate={updateAnnotation}
          onAnnotationDelete={deleteAnnotation}
          selectedAnnotationId={selectedAnnotationId}
          onAnnotationSelect={setSelectedAnnotationId}
        />
      </div>
    </div>
  );
}

    