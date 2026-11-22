import {inspect} from './inspect.mjs';

self.onmessage = ({data}) => {
  try { self.postMessage({result:inspect(data)}); }
  catch (error) { self.postMessage({error:error.message}); }
};
