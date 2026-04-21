export interface ViewportMetrics {
  size: number;
  outer: number;
  inner: number;
}

export const DEFAULT_VIEWPORT_METRICS: ViewportMetrics = {
  size: 320,
  outer: 15,
  inner: 5
};

function calculateViewportMetrics(width: number, height: number, portrait: boolean): ViewportMetrics {
  const maxWidth = portrait ? width - 48 : width - 368;
  const maxHeight = portrait ? height - 397 : height - 128;
  const size = Math.max(120, Math.min(maxWidth, maxHeight));
  const outer = portrait
    ? Math.max(4, Math.min(10, Math.round(size / 48)))
    : Math.max(8, Math.min(20, Math.round(size / 40)));
  const inner = Math.max(1, Math.floor(outer / 3));
  return { size, outer, inner };
}

export class ViewportService {
  private mediaQuery: MediaQueryList | undefined;
  private readonly handleChange = () => {
    this.onChange(this.getMetrics());
  };

  constructor(private readonly onChange: (metrics: ViewportMetrics) => void) {}

  public start() {
    this.dispose();
    this.mediaQuery = window.matchMedia("(orientation: portrait)");
    this.mediaQuery.addEventListener("change", this.handleChange);
    window.addEventListener("resize", this.handleChange);
    this.handleChange();
  }

  public dispose() {
    this.mediaQuery?.removeEventListener("change", this.handleChange);
    window.removeEventListener("resize", this.handleChange);
    this.mediaQuery = undefined;
  }

  private getMetrics(): ViewportMetrics {
    return calculateViewportMetrics(window.innerWidth, window.innerHeight, this.mediaQuery?.matches ?? false);
  }
}
