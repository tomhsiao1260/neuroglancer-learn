export interface Disposable {
  dispose: () => void;
}

export type Disposer = Disposable | (() => void);

export class RefCounted implements Disposable {
  private disposers: Disposer[];

  dispose() {
    console.log("not implement yet");
  }

  registerDisposer<T extends Disposer>(f: T): T {
    const { disposers } = this;
    if (disposers == null) {
      this.disposers = [f];
    } else {
      disposers.push(f);
    }
    return f;
  }
}
