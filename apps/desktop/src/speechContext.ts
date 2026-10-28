// Last assistant message, handed to whisper as its initial prompt so replies to
// what Luna just said (and names like Mivuneko) are recognised more reliably.
let context = "";
export const setSpeechContext = (text: string) => {
  context = text.slice(-200);
};
export const getSpeechContext = () => context;
