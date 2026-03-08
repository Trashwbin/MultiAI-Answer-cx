interface Html2CanvasOptions {
  backgroundColor?: string;
  scale?: number;
  logging?: boolean;
  useCORS?: boolean;
}

declare function html2canvas(
  element: HTMLElement,
  options?: Html2CanvasOptions,
): Promise<HTMLCanvasElement>;
