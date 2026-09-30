import { useEffect, useState } from "preact/hooks";

const query = "(max-width: 767px)";

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
