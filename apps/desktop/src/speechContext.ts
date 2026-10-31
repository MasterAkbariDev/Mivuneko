// Last assistant message, handed to whisper as its initial prompt so replies to
// what Luna just said (and names like Mivuneko) are recognised more reliably.
let context = "";
// A longer tail of the same reply, used to tell her own voice from the user's.
let spoken = "";
export const setSpeechContext = (text: string) => {
  context = text.slice(-200);
  spoken = text.slice(-2000);
};
export const getSpeechContext = () => context;
export const getSpokenText = () => spoken;
