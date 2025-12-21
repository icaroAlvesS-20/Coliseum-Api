import { encryptionService } from '../services/encryption.service.js';

export const encryptResponseMiddleware = (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
        try {
            // Verificar se deve criptografar URLs
            if (req.headers['x-encrypt-urls'] === 'true' || 
                process.env.ENCRYPT_URLS === 'true') {
                
                if (Array.isArray(data)) {
                    data = data.map(item => encryptSensitiveFields(item));
                } else if (data && typeof data === 'object') {
                    data = encryptSensitiveFields(data);
                }
            }
            
            // Sempre descriptografar URLs para o cliente (se necessário)
            if (Array.isArray(data)) {
                data = data.map(item => decryptSensitiveFields(item));
            } else if (data && typeof data === 'object') {
                data = decryptSensitiveFields(data);
            }
            
            originalJson.call(this, data);
        } catch (error) {
            console.error('❌ Erro no middleware de criptografia:', error);
            originalJson.call(this, data);
        }
    };
    
    next();
};

function encryptSensitiveFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const encrypted = { ...obj };
    
    // Campos que devem ser criptografados
    const fieldsToEncrypt = ['videoUrl', 'url', 'video', 'link', 'embedUrl'];
    
    fieldsToEncrypt.forEach(field => {
        if (encrypted[field] && typeof encrypted[field] === 'string') {
            try {
                if (field === 'videoUrl' || field === 'url') {
                    encrypted[field] = encryptionService.encryptYouTubeUrl(encrypted[field]);
                } else {
                    encrypted[field] = encryptionService.encrypt(encrypted[field]);
                }
            } catch (error) {
                console.error(`❌ Erro ao criptografar campo ${field}:`, error);
            }
        }
    });
    
    return encrypted;
}

function decryptSensitiveFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const decrypted = { ...obj };
    
    // Campos que podem estar criptografados
    const fieldsToDecrypt = ['videoUrl', 'url', 'video', 'link', 'embedUrl'];
    
    fieldsToDecrypt.forEach(field => {
        if (decrypted[field] && typeof decrypted[field] === 'object') {
            try {
                if (field === 'videoUrl' || field === 'url') {
                    decrypted[field] = encryptionService.decryptYouTubeUrl(decrypted[field]);
                } else {
                    decrypted[field] = encryptionService.decrypt(decrypted[field]);
                }
            } catch (error) {
                // Se falhar, manter o valor original
                console.warn(`⚠️ Não foi possível descriptografar campo ${field}`);
            }
        }
    });
    
    return decrypted;
}

// Middleware para criptografar dados antes de salvar no banco
export const encryptRequestBodyMiddleware = (req, res, next) => {
    try {
        if (req.body && typeof req.body === 'object') {
            const fieldsToEncrypt = ['videoUrl', 'url', 'video', 'link', 'embedUrl'];
            
            fieldsToEncrypt.forEach(field => {
                if (req.body[field] && typeof req.body[field] === 'string') {
                    if (field === 'videoUrl' || field === 'url') {
                        req.body[field] = encryptionService.encryptYouTubeUrl(req.body[field]);
                    } else {
                        req.body[field] = encryptionService.encrypt(req.body[field]);
                    }
                }
            });
        }
    } catch (error) {
        console.error('❌ Erro ao criptografar request body:', error);
    }
    
    next();
};
