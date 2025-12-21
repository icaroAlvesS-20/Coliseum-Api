import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export class EncryptionService {
    constructor() {
        this.algorithm = process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm';
        this.key = this.loadEncryptionKey();
        this.ivLength = 16;
        this.authTagLength = 16;
    }

    loadEncryptionKey() {
        const keyFromEnv = process.env.ENCRYPTION_KEY;
        
        if (!keyFromEnv) {
            throw new Error('ENCRYPTION_KEY não configurada no .env');
        }
        
        // Se a chave estiver em hex (64 caracteres), converter
        if (/^[0-9a-fA-F]{64}$/.test(keyFromEnv)) {
            return Buffer.from(keyFromEnv, 'hex');
        }
        
        // Se for uma string, derivar para 32 bytes usando SHA-256
        return crypto.createHash('sha256').update(keyFromEnv).digest();
    }

    encrypt(text) {
        try {
            // Verificar se o texto é válido
            if (!text || typeof text !== 'string') {
                throw new Error('Texto inválido para criptografia');
            }

            // Gerar IV único para cada operação
            const iv = crypto.randomBytes(this.ivLength);
            
            // Criar cipher
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
            
            // Criptografar
            const encrypted = Buffer.concat([
                cipher.update(text, 'utf8'),
                cipher.final()
            ]);
            
            // Obter tag de autenticação
            const authTag = cipher.getAuthTag();
            
            // Combinar tudo em um buffer único
            const result = Buffer.concat([
                iv,              // 16 bytes
                authTag,         // 16 bytes
                encrypted        // tamanho variável
            ]);

            return {
                encrypted: result.toString('base64'),
                iv: iv.toString('base64'),
                tag: authTag.toString('base64'),
                version: '1.0',
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ Erro ao criptografar:', error.message);
            throw new Error(`Falha ao criptografar: ${error.message}`);
        }
    }

    decrypt(encryptedData) {
        try {
            // Se for um objeto com propriedades separadas
            if (encryptedData.encrypted && encryptedData.iv && encryptedData.tag) {
                const iv = Buffer.from(encryptedData.iv, 'base64');
                const authTag = Buffer.from(encryptedData.tag, 'base64');
                const encrypted = Buffer.from(encryptedData.encrypted, 'base64');
                
                const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
                decipher.setAuthTag(authTag);
                
                const decrypted = Buffer.concat([
                    decipher.update(encrypted),
                    decipher.final()
                ]);
                
                return decrypted.toString('utf8');
            }
            
            // Se for apenas uma string base64 combinada
            const combinedBuffer = Buffer.from(encryptedData, 'base64');
            
            // Extrair partes
            const iv = combinedBuffer.slice(0, this.ivLength);
            const authTag = combinedBuffer.slice(this.ivLength, this.ivLength + this.authTagLength);
            const encrypted = combinedBuffer.slice(this.ivLength + this.authTagLength);
            
            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            decipher.setAuthTag(authTag);
            
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
            
            return decrypted.toString('utf8');
        } catch (error) {
            console.error('❌ Erro ao descriptografar:', error.message);
            
            // Se falhar na descriptografia, retornar o dado original (pode ser um URL não criptografado)
            if (typeof encryptedData === 'string' && encryptedData.startsWith('http')) {
                console.log('⚠️ Retornando URL não criptografada como fallback');
                return encryptedData;
            }
            
            throw new Error(`Falha ao descriptografar: ${error.message}`);
        }
    }

    // Método específico para URLs do YouTube
    encryptYouTubeUrl(url) {
        if (!url) return null;
        
        // Extrair apenas o ID do vídeo para menor tamanho
        const videoId = this.extractYouTubeId(url);
        if (videoId) {
            // Armazenar como objeto com ID e URL completa
            const data = JSON.stringify({
                videoId,
                originalUrl: url,
                type: 'youtube'
            });
            return this.encrypt(data);
        }
        
        // Se não for URL do YouTube, criptografar normalmente
        return this.encrypt(url);
    }

    decryptYouTubeUrl(encryptedData) {
        try {
            const decrypted = this.decrypt(encryptedData);
            
            // Tentar parsear como objeto JSON
            try {
                const data = JSON.parse(decrypted);
                if (data.type === 'youtube' && data.videoId) {
                    // Reconstruir URL do YouTube
                    return `https://www.youtube.com/watch?v=${data.videoId}`;
                }
            } catch (e) {
                // Não é JSON, retornar como está
            }
            
            return decrypted;
        } catch (error) {
            console.error('❌ Erro ao descriptografar URL do YouTube:', error);
            return null;
        }
    }

    extractYouTubeId(url) {
        if (!url) return null;
        
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/\s]+)/,
            /youtube\.com\/v\/([^&\?\/\s]+)/,
            /youtube\.com\/watch\?.*v=([^&\s]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }

    // Gerar nova chave (use apenas uma vez para criar)
    static generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
}

// Singleton para usar em toda a aplicação
export const encryptionService = new EncryptionService();
