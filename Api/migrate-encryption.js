import { PrismaClient } from '@prisma/client';
import { encryptionService } from './services/encryption.service.js';

const prisma = new PrismaClient();

async function migrateExistingData() {
  console.log('🔧 Migrando dados existentes para criptografia...');
  
  try {
    // Migrar vídeos
    console.log('📹 Migrando vídeos...');
    const videos = await prisma.video.findMany();
    
    for (const video of videos) {
      if (video.url && !video.iv) { // Verificar se não está criptografado
        try {
          const encrypted = encryptionService.encryptYouTubeUrl(video.url);
          
          await prisma.video.update({
            where: { id: video.id },
            data: {
              url: encrypted.encrypted,
              iv: encrypted.iv,
              tag: encrypted.tag
            }
          });
          
          console.log(`✅ Vídeo ${video.id} migrado`);
        } catch (error) {
          console.error(`❌ Erro ao migrar vídeo ${video.id}:`, error);
        }
      }
    }
    
    // Migrar aulas
    console.log('🎓 Migrando aulas...');
    const aulas = await prisma.aula.findMany();
    
    for (const aula of aulas) {
      if (aula.videoUrl && !aula.videoIv) {
        try {
          const encrypted = encryptionService.encryptYouTubeUrl(aula.videoUrl);
          
          await prisma.aula.update({
            where: { id: aula.id },
            data: {
              videoUrl: encrypted.encrypted,
              videoIv: encrypted.iv,
              videoTag: encrypted.tag
            }
          });
          
          console.log(`✅ Aula ${aula.id} migrada`);
        } catch (error) {
          console.error(`❌ Erro ao migrar aula ${aula.id}:`, error);
        }
      }
    }
    
    console.log('🎉 Migração concluída!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar migração
migrateExistingData();
