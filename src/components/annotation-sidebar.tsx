
"use client";

import type React from 'react';
import type { Annotation, TextAnnotation, ImageAnnotation } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Edit3 } from 'lucide-react';

interface AnnotationSidebarProps {
  annotations: Annotation[];
  onAnnotationUpdate: (annotation: Annotation) => void;
  onAnnotationDelete: (id: string) => void;
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
}

const AnnotationSidebar: React.FC<AnnotationSidebarProps> = ({
  annotations,
  onAnnotationUpdate,
  onAnnotationDelete,
  selectedAnnotationId,
  onAnnotationSelect,
}) => {
  const textAnnotations = annotations.filter(
    (anno) => anno.type === 'text'
  ) as TextAnnotation[];
  const imageAnnotations = annotations.filter(
    (anno) => anno.type === 'image'
  ) as ImageAnnotation[];

  const renderTextAnnotationEditor = (anno: TextAnnotation) => (
    <Card key={anno.id} className={`mb-4 ${selectedAnnotationId === anno.id ? 'border-primary' : ''}`} onClick={() => onAnnotationSelect(anno.id)}>
      <CardHeader className="p-4">
        <CardTitle className="text-base font-headline flex justify-between items-center">
          Text (Page {anno.page})
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onAnnotationDelete(anno.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div>
          <Label htmlFor={`text-${anno.id}`}>Content</Label>
          <Input
            id={`text-${anno.id}`}
            type="text"
            value={anno.text}
            onChange={(e) => onAnnotationUpdate({ ...anno, text: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`fontSize-${anno.id}`}>Font Size</Label>
            <Input
              id={`fontSize-${anno.id}`}
              type="number"
              value={anno.fontSize}
              onChange={(e) => onAnnotationUpdate({ ...anno, fontSize: parseInt(e.target.value) || 12 })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`fontColor-${anno.id}`}>Color</Label>
            <Input
              id={`fontColor-${anno.id}`}
              type="color"
              value={anno.color}
              onChange={(e) => onAnnotationUpdate({ ...anno, color: e.target.value })}
              className="mt-1 h-10"
            />
          </div>
        </div>
         <div className="grid grid-cols-1 gap-2"> {/* Changed to 1 column for width */}
          <div>
            <Label htmlFor={`textWidth-${anno.id}`}>Width (%)</Label>
            <Input
              id={`textWidth-${anno.id}`}
              type="number"
              value={anno.width}
              onChange={(e) => onAnnotationUpdate({ ...anno, width: parseFloat(e.target.value) || 20 })}
              className="mt-1"
            />
          </div>
          {/* Height input removed for text annotations */}
        </div>
      </CardContent>
    </Card>
  );

  const renderImageAnnotationEditor = (anno: ImageAnnotation) => (
     <Card key={anno.id} className={`mb-4 ${selectedAnnotationId === anno.id ? 'border-primary' : ''}`} onClick={() => onAnnotationSelect(anno.id)}>
      <CardHeader className="p-4">
        <CardTitle className="text-base font-headline flex justify-between items-center">
          Image (Page {anno.page})
           <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onAnnotationDelete(anno.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <img src={anno.src} alt={anno.alt} className="w-full h-auto rounded border" data-ai-hint="annotation preview"/>
        <div>
          <Label htmlFor={`imgAlt-${anno.id}`}>Alt Text</Label>
          <Input
            id={`imgAlt-${anno.id}`}
            type="text"
            value={anno.alt}
            onChange={(e) => onAnnotationUpdate({ ...anno, alt: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`imgWidth-${anno.id}`}>Width</Label>
            <Input
              id={`imgWidth-${anno.id}`}
              type="text" 
              value={anno.width}
              placeholder="e.g. 25% or 100px"
              onChange={(e) => onAnnotationUpdate({ ...anno, width: e.target.value || "25%" })} 
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`imgHeight-${anno.id}`}>Height</Label>
            <Input
              id={`imgHeight-${anno.id}`}
              type="text" 
              value={anno.height}
              placeholder="e.g. 15% or 80px"
              onChange={(e) => onAnnotationUpdate({ ...anno, height: e.target.value || "15%" })} 
              className="mt-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );


  return (
    <div className="w-96 bg-card border-l p-4 h-full flex flex-col">
      <h2 className="text-xl font-headline mb-4 text-center">Annotations</h2>
      <Tabs defaultValue="text" className="flex-grow flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="text">Text ({textAnnotations.length})</TabsTrigger>
          <TabsTrigger value="image">Images ({imageAnnotations.length})</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        <ScrollArea className="flex-grow mt-4 pr-2">
          <TabsContent value="text">
            {textAnnotations.length > 0 ? (
              textAnnotations.map(renderTextAnnotationEditor)
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No text annotations yet.</p>
            )}
          </TabsContent>
          <TabsContent value="image">
            {imageAnnotations.length > 0 ? (
              imageAnnotations.map(renderImageAnnotationEditor)
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No image annotations yet.</p>
            )}
          </TabsContent>
          <TabsContent value="json">
            {annotations.length > 0 ? (
              <pre className="text-xs whitespace-pre-wrap break-all p-2 border rounded bg-muted/20">
                {JSON.stringify(annotations, null, 4)}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No annotations to display.</p>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

export default AnnotationSidebar;

    