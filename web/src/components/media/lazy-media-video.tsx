"use client";

import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";

export function LazyMediaVideo({ src, preload = "metadata", ...props }: { src: string } & Omit<VideoHTMLAttributes<HTMLVideoElement>, "src">) {
    const [ready, setReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (ready) return;
        const video = videoRef.current;
        if (!video || typeof IntersectionObserver === "undefined") {
            setReady(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                setReady(true);
                observer.disconnect();
            },
            { rootMargin: "50% 0px" },
        );
        observer.observe(video);
        return () => observer.disconnect();
    }, [ready]);

    return <video {...props} ref={videoRef} src={ready ? src : undefined} preload={ready ? preload : "none"} />;
}
