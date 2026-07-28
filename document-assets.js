(function () {
    const DEFAULT_ASSETS = {
        companyLogo: 'assets/certificates/bihar-skill-intern-logo.png',
        officialSeal: 'assets/certificates/bihar-skill-interns-round-seal.png',
        authorizedSignature: 'assets/certificates/authorized-signature-official.png',
        programCoordinatorSignature: 'assets/certificates/program-coordinator-signature.png',
        verificationQr: 'assets/certificates/bihar-skill-interns-verification-qr.png'
    };

    const STORAGE_KEY = 'bsiDocumentBrandingAssets';
    const STYLE_ID = 'bsi-document-assets-style';
    const FETCH_TIMEOUT_MS = 4000;
    let activeAssets = { ...DEFAULT_ASSETS };
    let loadPromise = null;

    function ensureAssetStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            [data-document-asset] {
                opacity: 0;
            }

            [data-document-asset][data-document-asset-ready="true"] {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    function normalizeAssets(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function getApiBaseUrl() {
        if (typeof API_BASE_URL !== 'undefined') return API_BASE_URL;
        if (window.API_BASE_URL) return window.API_BASE_URL;
        return 'https://bihar-skill-intern-backend.onrender.com/api';
    }

    function loadCachedAssets() {
        try {
            const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            activeAssets = { ...activeAssets, ...normalizeAssets(cached) };
        } catch (error) {
            console.warn('Unable to read cached document assets:', error.message);
        }
    }

    async function load() {
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            loadCachedAssets();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                let response;
                try {
                    response = await fetch(`${getApiBaseUrl()}/document-assets/public`, {
                        cache: 'no-store',
                        signal: controller.signal
                    });
                } finally {
                    clearTimeout(timeoutId);
                }
                const payload = await response.json();
                if (response.ok && payload?.success && payload.assets) {
                    activeAssets = { ...DEFAULT_ASSETS, ...payload.assets };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeAssets));
                }
            } catch (error) {
                console.warn('Document asset API unavailable; using bundled defaults:', error.message);
            }
            return activeAssets;
        })();
        return loadPromise;
    }

    function get(assetKey) {
        return activeAssets[assetKey] || DEFAULT_ASSETS[assetKey] || '';
    }

    function apply(root = document) {
        if (!root?.querySelectorAll) return;
        root.querySelectorAll('[data-document-asset]').forEach(element => {
            const assetKey = element.getAttribute('data-document-asset');
            const url = get(assetKey);
            if (url && element.getAttribute('src') !== url) {
                element.setAttribute('src', url);
            }
            element.setAttribute('data-document-asset-ready', 'true');
        });
    }

    async function loadAndApply(root = document) {
        await load();
        apply(root);
        return activeAssets;
    }

    window.BSIDocumentAssets = {
        defaults: DEFAULT_ASSETS,
        load,
        get,
        apply,
        loadAndApply
    };

    ensureAssetStyle();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => loadAndApply());
    } else {
        loadAndApply();
    }
})();
