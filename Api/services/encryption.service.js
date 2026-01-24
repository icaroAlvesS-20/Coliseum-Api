import { encryptionService } from '../services/encryption.service.js';

export const encryptResponseMiddleware = (req, res, next) => {
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Interceptar res.json()
    res.json = function(data) {
        if (data && typeof data === 'object') {
            data = processEncryption(data, 'encrypt');
        }
        return originalJson.call(this, data);
    };
    
    // Interceptar res.send() para objetos JSON
    res.send = function(data) {
        if (data && typeof data === 'object') {
            data = processEncryption(data, 'encrypt');
        }
        return originalSend.call(this, data);
    };
    
    next();
};

// Middleware para descriptografar requisições
export const encryptRequestBodyMiddleware = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        req.body = processEncryption(req.body, 'decrypt');
    }
    next();
};

// Função para processar criptografia/descriptografia
function processEncryption(data, operation) {
    if (!data || typeof data !== 'object') return data;
    
    // Se for array, processar cada item
    if (Array.isArray(data)) {
        return data.map(item => processEncryption(item, operation));
    }
    
    const result = { ...data };
    
    // Processar URLs do YouTube
    if (result.url) {
        if (operation === 'encrypt' && result.url.includes('youtube.com')) {
            try {
                const encrypted = encryptionService.encryptYouTubeUrl(result.url);
                if (encrypted) {
                    result.url = encrypted.encrypted;
                    result.iv = encrypted.iv;
                    result.tag = encrypted.tag;
                }
            } catch (error) {
                console.warn('⚠️ Não foi possível criptografar URL:', error.message);
            }
        } else if (operation === 'decrypt' && result.iv && result.tag) {
            try {
                const decrypted = encryptionService.decryptYouTubeUrl({
                    encrypted: result.url,
                    iv: result.iv,
                    tag: result.tag
                });
                if (decrypted) {
                    result.url = decrypted;
                    delete result.iv;
                    delete result.tag;
                }
            } catch (error) {
                console.warn('⚠️ Não foi possível descriptografar URL:', error.message);
            }
        }
    }
    
    // Processar videoUrl (para aulas)
    if (result.videoUrl) {
        if (operation === 'encrypt' && result.videoUrl.includes('youtube.com')) {
            try {
                const encrypted = encryptionService.encryptYouTubeUrl(result.videoUrl);
                if (encrypted) {
                    result.videoUrl = encrypted.encrypted;
                    result.videoIv = encrypted.iv;
                    result.videoTag = encrypted.tag;
                }
            } catch (error) {
                console.warn('⚠️ Não foi possível criptografar videoUrl:', error.message);
            }
        } else if (operation === 'decrypt' && result.videoIv && result.videoTag) {
            try {
                const decrypted = encryptionService.decryptYouTubeUrl({
                    encrypted: result.videoUrl,
                    iv: result.videoIv,
                    tag: result.videoTag
                });
                if (decrypted) {
                    result.videoUrl = decrypted;
                    delete result.videoIv;
                    delete result.videoTag;
                }
            } catch (error) {
                console.warn('⚠️ Não foi possível descriptografar videoUrl:', error.message);
            }
        }
    }
    
    // Processar recursivamente objetos aninhados
    for (const key in result) {
        if (result[key] && typeof result[key] === 'object' && key !== 'iv' && key !== 'tag' && key !== 'videoIv' && key !== 'videoTag') {
            result[key] = processEncryption(result[key], operation);
        }
    }
    
    return result;
}
