export class RPC {
  constructor(public target: any) {
    target.onmessage = (e) => {
      console.log("data from frontend: ", e.data);
    };

    target.postMessage({ payload: "hello world" });
  }
}
