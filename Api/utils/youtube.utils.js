export class YouTubeUtils {
    static extractVideoId(url) {
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

    static buildUrl(videoId) {
        if (!videoId) return null;
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    static isValidUrl(url) {
        if (!url) return false;
        return this.extractVideoId(url) !== null;
    }

    static getEmbedUrl(videoId) {
        if (!videoId) return null;
        return `https://www.youtube.com/embed/${videoId}`;
    }

    static getThumbnail(videoId, quality = 'hqdefault') {
        if (!videoId) return null;
        return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    }
}
