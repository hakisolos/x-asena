const fs = require('fs');
const path = require('path');
const config =require("../config")
/*async function retrieveSession(sessionId, savePath) {
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            config.DBURL,
            config.SUPKEY
        );

        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }

        const { data, error } = await supabase
            .storage
            .from('bot-sessions')
            .list(sessionId);

        if (error || !data || !data.length) {
            console.log('❌ No files found for this session ID');
            return false;
        }

        for (const file of data) {
            const fileName = file.name;
            const localFilePath = path.join(savePath, fileName);

            const { data: fileData, error: downloadError } = await supabase
                .storage
                .from('bot-sessions')
                .download(`${sessionId}/${fileName}`);

            if (downloadError) {
                console.log(`⚠️ Failed to download ${fileName}`);
                continue;
            }

            const buffer = Buffer.from(await fileData.arrayBuffer());

            try {
                JSON.parse(buffer.toString('utf8')); // Validate JSON
            } catch (e) {
                console.log(`⚠️ ${fileName} is not valid JSON, but saving anyway`);
            }

            fs.writeFileSync(localFilePath, buffer);
            console.log(`✅ Downloaded ${fileName}`);
        }

        return true;

    } catch (e) {
        console.error('❌ Error during session retrieval:', e);
        return false;
    }
}

module.exports = retrieveSession;
*/