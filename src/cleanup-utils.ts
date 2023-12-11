export function getRelevantEvents(events: string[]): string[] {
  // Mon, 11 Dec 2023 06:29:36 GMT:{"timestamp":1702276176,"exe":"git-remote-http","host":"github.com","path":"/harden-runner-canary/agent-ecapture/info/refs?service=git-upload-pack","method":"GET"}

  let output: string[];

  let filtered_events = events.filter((val, _) => {
    return val.indexOf("github.com") > -1 || val.indexOf("api.github.com") > -1;
  });

  output = filtered_events.map((val, _) => {
    return val.replace("GMT:", "GMT:[Github Request] ");
  });

  return output;
}
