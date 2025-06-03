export interface BaseAnnotation {
  id: string;
  page: number;
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  height: number; // percentage
  rotation: number; // degrees
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  text: string;
  fontSize: number; // in pixels relative to a default PDF page size, or PDF points
  fontFamily: string;
  color: string;
}

export interface ImageAnnotation extends BaseAnnotation {
  type: 'image';
  src: string; // data URL
  alt: string;
}

export type Annotation = TextAnnotation | ImageAnnotation;

// This is a global declaration for pdfjsLib if not already typed
declare global {
  interface Window {
    pdfjsLib: any;
  }
}
