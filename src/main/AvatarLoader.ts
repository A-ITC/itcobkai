import { IMAGE_URL, loadImage } from "../common/Common";
import { User } from "../common/Schema";

export default class AvatarLoader {
  private avatars: Record<string, HTMLImageElement> = {};
  private pendingLoads = new Map<string, Promise<HTMLImageElement>>();

  public async preload(users: User[]): Promise<void> {
    await Promise.all(users.map(user => this.ensureLoaded(user)));
  }

  public get(user: User): HTMLImageElement | undefined {
    return this.avatars[user.h];
  }

  private ensureLoaded(user: User): Promise<HTMLImageElement> {
    const avatarUrl = user.avatar ? `${IMAGE_URL}/${user.avatar}` : "";
    const current = this.avatars[user.h];
    if (current && (!avatarUrl || current.src.endsWith(avatarUrl))) {
      return Promise.resolve(current);
    }

    const loadKey = `${user.h}:${avatarUrl}`;
    const pending = this.pendingLoads.get(loadKey);
    if (pending) {
      return pending;
    }

    const image = new Image();
    const load = loadImage(avatarUrl, image).then(loaded => {
      this.avatars[user.h] = loaded;
      this.pendingLoads.delete(loadKey);
      return loaded;
    });

    this.pendingLoads.set(loadKey, load);
    return load;
  }
}
