// プレイヤーの音声を管理するクラス
export default class Mixer {
  private userGains: Map<string, GainNode> = new Map();
  private userDests: Map<string, MediaStreamAudioDestinationNode> = new Map();

  public addUser(hash: string, source: MediaStreamAudioSourceNode, dest: MediaStreamAudioDestinationNode) {
    const ctx = source.context;
    const gainNode = ctx.createGain();
    source.connect(gainNode);
    this.userGains.set(hash, gainNode);
    this.userDests.set(hash, dest);
  }

  public mute(hash: string, mute: boolean) {
    const gainNode = this.userGains.get(hash);
    if (gainNode) {
      gainNode.gain.setTargetAtTime(mute ? 0 : 1, gainNode.context.currentTime, 0.01);
    }
  }

  public update(connects: [string, string][], disconnects: [string, string][]) {
    // 接続解除
    for (const [from, to] of disconnects) {
      const sourceGain = this.userGains.get(from);
      const targetDest = this.userDests.get(to);
      if (sourceGain && targetDest) {
        try {
          sourceGain.disconnect(targetDest);
        } catch (e) {
          console.warn(`Failed to disconnect ${from} from ${to}`, e);
        }
      }
    }

    // 新規接続
    for (const [from, to] of connects) {
      const sourceGain = this.userGains.get(from);
      const targetDest = this.userDests.get(to);
      if (sourceGain && targetDest) {
        sourceGain.connect(targetDest);
      }
    }
  }

  public removeUser(hash: string) {
    const gainNode = this.userGains.get(hash);
    if (gainNode) {
      gainNode.disconnect();
      this.userGains.delete(hash);
    }
    this.userDests.delete(hash);
  }
}
