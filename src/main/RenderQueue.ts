export default class RenderQueue {
  private drawing = false;
  private drawQueued = false;
  private pending = Promise.resolve();

  public constructor(private readonly render: () => Promise<void>) {}

  public schedule(): Promise<void> {
    if (this.drawing) {
      this.drawQueued = true;
      return this.pending;
    }

    this.pending = this.run();
    return this.pending;
  }

  private async run(): Promise<void> {
    this.drawing = true;
    try {
      do {
        this.drawQueued = false;
        await this.render();
      } while (this.drawQueued);
    } finally {
      this.drawing = false;
    }
  }
}
