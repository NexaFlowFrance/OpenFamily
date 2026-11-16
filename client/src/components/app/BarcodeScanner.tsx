import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '../ui';
import { isNative } from '../../lib/serverConfig';

// Reads a barcode with the camera, using the detector built into the browser
// (Chrome and Edge on Android, Samsung Internet, Chrome on macOS). Nothing is
// loaded for it and no image leaves the device: the browser hands back the
// digits. Where the detector does not exist, the barcode is typed, and
// `canScanBarcodes` lets the caller hide the button.
//
// The Android app does not declare the camera permission, so its web view
// refuses the camera: no button there either, the barcode is typed.

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const detectorConstructor = (): BarcodeDetectorConstructor | null =>
    (typeof window !== 'undefined' && (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector) || null;

/** True when a barcode can be read with the camera here: a browser with the detector, a camera, and HTTPS. */
export const canScanBarcodes = (): boolean =>
    !isNative()
    && Boolean(detectorConstructor())
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && (typeof window === 'undefined' || window.isSecureContext);

// The barcodes printed on products.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_EVERY_MS = 250;

interface BarcodeScannerProps {
    open: boolean;
    onClose: () => void;
    /** Called once, with the digits, as soon as a barcode is read. */
    onDetected: (barcode: string) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ open, onClose, onDetected }) => {
    const { t } = useTranslation(['pantry', 'common']);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        setFailed(false);

        let stopped = false;
        let stream: MediaStream | null = null;
        let timer: number | undefined;

        const stop = () => {
            stopped = true;
            if (timer !== undefined) window.clearInterval(timer);
            stream?.getTracks().forEach((track) => track.stop());
        };

        const start = async () => {
            const Detector = detectorConstructor();
            if (!Detector) { setFailed(true); return; }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
                // Closed while the browser was asking for the camera.
                if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
                const video = videoRef.current;
                if (!video) { stop(); return; }
                video.srcObject = stream;
                await video.play();

                const detector = new Detector({ formats: FORMATS });
                let busy = false;
                timer = window.setInterval(() => {
                    if (busy || stopped || video.readyState < 2) return;
                    busy = true;
                    detector.detect(video)
                        .then((found) => {
                            const digits = found.map((code) => code.rawValue.trim()).find((value) => /^\d{6,20}$/.test(value));
                            if (digits && !stopped) {
                                stop();
                                onDetected(digits);
                            }
                        })
                        // A frame that could not be read is only a frame.
                        .catch(() => undefined)
                        .finally(() => { busy = false; });
                }, SCAN_EVERY_MS);
            } catch {
                // No camera, or the permission was refused.
                if (!stopped) setFailed(true);
            }
        };

        void start();
        return stop;
        // onDetected is the caller's and may change at every render: the camera
        // must not restart for that.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => { if (!next) onClose(); }}
            title={t('pantry:scan.title')}
            description={t('pantry:scan.description')}
        >
            <div className="space-y-4">
                {failed ? (
                    <p className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
                        {t('pantry:scan.unavailable')}
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-card bg-black">
                        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
                    </div>
                )}
                <div className="flex justify-end">
                    <Button type="button" variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
                </div>
            </div>
        </Dialog>
    );
};

export default BarcodeScanner;
