import { Move, User } from "../common/Schema";

export type UsersById = Record<string, User>;

type UserListener = (users: UsersById) => void;

function cloneUser(user: User): User {
  return {
    ...user,
    groups: [...user.groups]
  };
}

function cloneUsers(users: UsersById): UsersById {
  return Object.fromEntries(Object.values(users).map(user => [user.h, cloneUser(user)]));
}

export default class UserStore {
  private users: UsersById = {};
  private listeners = new Set<UserListener>();
  private batchDepth = 0;
  private dirty = false;

  public subscribe(listener: UserListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async batch<T>(action: () => T | Promise<T>): Promise<T> {
    this.batchDepth += 1;
    try {
      return await action();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.dirty) {
        this.dirty = false;
        this.emit();
      }
    }
  }

  public snapshot(): UsersById {
    return cloneUsers(this.users);
  }

  public get(h: string): User | undefined {
    const user = this.users[h];
    return user ? cloneUser(user) : undefined;
  }

  public has(h: string): boolean {
    return !!this.users[h];
  }

  public replaceAll(users: User[]): void {
    this.users = Object.fromEntries(users.map(user => [user.h, cloneUser(user)]));
    this.markChanged();
  }

  public upsert(user: User): void {
    this.users[user.h] = cloneUser(user);
    this.markChanged();
  }

  public remove(h: string): User | undefined {
    const existing = this.users[h];
    if (!existing) {
      return undefined;
    }
    delete this.users[h];
    this.markChanged();
    return cloneUser(existing);
  }

  public applyMoves(moves: Move[]): boolean {
    let changed = false;
    for (const move of moves) {
      const user = this.users[move.h];
      if (!user) {
        continue;
      }
      if (user.x === move.x && user.y === move.y) {
        continue;
      }
      user.x = move.x;
      user.y = move.y;
      changed = true;
    }
    if (changed) {
      this.markChanged();
    }
    return changed;
  }

  public setMuted(h: string, muted: boolean): boolean {
    const user = this.users[h];
    if (!user) {
      return false;
    }
    if (user.mute === muted) {
      return true;
    }
    user.mute = muted;
    this.markChanged();
    return true;
  }

  private markChanged(): void {
    if (this.batchDepth > 0) {
      this.dirty = true;
      return;
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
