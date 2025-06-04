
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
      setAnnotations([]); 
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
    setSelectedTool(null); 
    setSelectedAnnotationId(id); 
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
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const anno of annotations) {
        const page = pdfDoc.getPage(anno.page - 1);
        const { width: pageWidth, height: pageHeight } = page.getSize(); // in PDF points

        const annoX = (anno.x / 100) * pageWidth;
        let annoYBase = (anno.y / 100) * pageHeight; // Y from top in percentage

        if (anno.type === 'text') {
          const textAnno = anno as TextAnnotation;
          const colorString = textAnno.color.startsWith('#') ? textAnno.color.substring(1) : textAnno.color;
          const r = parseInt(colorString.substring(0, 2), 16) / 255;
          const g = parseInt(colorString.substring(2, 4), 16) / 255;
          const b = parseInt(colorString.substring(4, 6), 16) / 255;
          
          const annoTextWidth = (textAnno.width / 100) * pageWidth;
          // For text, height is somewhat automatic based on content and width, but Y positioning needs care.
          // We use a nominal height for Y positioning and let the text flow.
          const nominalTextHeightForYCalc = textAnno.fontSize * 1.5; // Estimate, or could use textAnno.height if it had meaning.
          const annoTextY = pageHeight - annoYBase - nominalTextHeightForYCalc; 


          page.drawText(textAnno.text, {
            x: annoX,
            y: annoTextY + nominalTextHeightForYCalc - textAnno.fontSize, // Adjust y for text baseline within the box
            size: textAnno.fontSize,
            font: helveticaFont,
            color: rgb(r, g, b),
            lineHeight: textAnno.fontSize * 1.2,
            maxWidth: annoTextWidth,
            rotate: degrees(textAnno.rotation || 0),
          });
        } else if (anno.type === 'image') {
          const imgAnno = anno as ImageAnnotation;
          let finalAnnoWidthInPoints: number;
          let finalAnnoHeightInPoints: number;

          // Process width string
          if (imgAnno.width.endsWith('%')) {
            const num = parseFloat(imgAnno.width);
            finalAnnoWidthInPoints = isNaN(num) ? (25/100 * pageWidth) : (num / 100) * pageWidth;
          } else if (imgAnno.width.endsWith('px')) {
            const num = parseFloat(imgAnno.width);
            finalAnnoWidthInPoints = isNaN(num) ? 100 : num; // Treat px as pt
          } else if (imgAnno.width.endsWith('pt')) {
            const num = parseFloat(imgAnno.width);
            finalAnnoWidthInPoints = isNaN(num) ? 100 : num;
          } else if (imgAnno.width.endsWith('em')) {
            const num = parseFloat(imgAnno.width);
            finalAnnoWidthInPoints = isNaN(num) ? 100 : num * 12; // 1em = 12pt
          } else if (!isNaN(parseFloat(imgAnno.width))) {
            finalAnnoWidthInPoints = parseFloat(imgAnno.width); // Treat unitless as pt
          } else {
            toast({ title: "Image Warning", description: `Unsupported width unit for image: ${imgAnno.width}. Defaulting.`, variant: "default" });
            finalAnnoWidthInPoints = (25 / 100) * pageWidth;
          }

          // Process height string
          if (imgAnno.height.endsWith('%')) {
            const num = parseFloat(imgAnno.height);
            finalAnnoHeightInPoints = isNaN(num) ? (15/100 * pageHeight) : (num / 100) * pageHeight;
          } else if (imgAnno.height.endsWith('px')) {
            const num = parseFloat(imgAnno.height);
            finalAnnoHeightInPoints = isNaN(num) ? 75 : num; // Treat px as pt
          } else if (imgAnno.height.endsWith('pt')) {
            const num = parseFloat(imgAnno.height);
            finalAnnoHeightInPoints = isNaN(num) ? 75 : num;
          } else if (imgAnno.height.endsWith('em')) {
            const num = parseFloat(imgAnno.height);
            finalAnnoHeightInPoints = isNaN(num) ? 75 : num * 12; // 1em = 12pt
          } else if (!isNaN(parseFloat(imgAnno.height))) {
            finalAnnoHeightInPoints = parseFloat(imgAnno.height); // Treat unitless as pt
          } else {
            toast({ title: "Image Warning", description: `Unsupported height unit for image: ${imgAnno.height}. Defaulting.`, variant: "default" });
            finalAnnoHeightInPoints = (15 / 100) * pageHeight;
          }
          
          const annoImgY = pageHeight - annoYBase - finalAnnoHeightInPoints; // Adjust Y for pdf-lib using calculated height

          try {
            let imageBytes: ArrayBuffer;
            if (imgAnno.src.startsWith('data:image')) {
              const base64Data = imgAnno.src.split(',')[1];
              imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
            } else {
              // Fetching external images might be blocked by CORS in some environments
              // For simplicity, assume local data URIs or successfully fetched array buffers
              const response = await fetch(imgAnno.src);
              imageBytes = await response.arrayBuffer();
            }
            
            let pdfImage;
            if (imgAnno.src.includes('png')) {
              pdfImage = await pdfDoc.embedPng(imageBytes);
            } else if (imgAnno.src.includes('jpeg') || imgAnno.src.includes('jpg')) {
              pdfImage = await pdfDoc.embedJpg(imageBytes);
            } else {
              console.warn(`Unsupported image type for annotation ${imgAnno.id}`);
              toast({ title: "Image Error", description: `Unsupported image type: ${imgAnno.alt}`, variant: "destructive" });
              continue;
            }
            
            page.drawImage(pdfImage, {
              x: annoX,
              y: annoImgY,
              width: finalAnnoWidthInPoints,
              height: finalAnnoHeightInPoints,
              rotate: degrees(imgAnno.rotation || 0),
            });
          } catch (error) {
            console.error(`Failed to embed image for annotation ${imgAnno.id}:`, error);
            toast({ title: "Image Error", description: `Could not embed image: ${imgAnno.alt}`, variant: "destructive" });
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
        <main className="flex-grow flex flex-col p-0 m-0 h-full min-w-0">
          {pdfFile && (
            <div className="bg-muted/30 p-2 border-b flex items-center justify-center gap-4 print:hidden">
              <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} variant="ghost" size="icon"><ArrowLeft /></Button>
              <span className="text-sm font-medium">Page {currentPage} of {numPages}</span>
              <Button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages || numPages === 0} variant="ghost" size="icon"><ArrowRight /></Button>
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
