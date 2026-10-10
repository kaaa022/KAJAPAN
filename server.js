const http = require("http");
const fs = require("fs");
const path = require("path");

const Kuroshiro = require("kuroshiro");
const KuromojiAnalyzer = require("kuroshiro-analyzer-kuromoji");

const PORT = process.env.PORT || 3000;

// ======================================
// KUROSHIRO
// ======================================

const kuroshiro = new Kuroshiro();
let kuroshiroReady = false;

async function initKuroshiro() {

    try {

        await kuroshiro.init(
            new KuromojiAnalyzer({
                dictPath: path.join(
                    __dirname,
                    "node_modules/kuromoji/dict/"
                )
            })
        );

        kuroshiroReady = true;

        console.log("Kuroshiro siap! 🔤");

    } catch (error) {

        console.error(
            "Kuroshiro gagal:",
            error
        );

    }

}

initKuroshiro();


// ======================================
// MIME TYPE
// ======================================

function getContentType(filePath) {

    const ext =
        path.extname(filePath)
            .toLowerCase();

    const types = {

        ".html":
            "text/html; charset=utf-8",

        ".css":
            "text/css; charset=utf-8",

        ".js":
            "application/javascript; charset=utf-8",

        ".json":
            "application/json; charset=utf-8",

        ".png":
            "image/png",

        ".jpg":
            "image/jpeg",

        ".jpeg":
            "image/jpeg",

        ".svg":
            "image/svg+xml",

        ".ico":
            "image/x-icon"

    };

    return (
        types[ext] ||
        "application/octet-stream"
    );

}


// ======================================
// SERVER
// ======================================

const server =
    http.createServer(
        (req, res) => {

            // ==================================
            // CORS
            // ==================================

            res.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            );

            res.setHeader(
                "Access-Control-Allow-Methods",
                "GET, POST, OPTIONS"
            );

            res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type"
            );


            // ==================================
            // OPTIONS
            // ==================================

            if (
                req.method === "OPTIONS"
            ) {

                res.writeHead(204);

                res.end();

                return;

            }


            // ==================================
            // API TEST
            // ==================================

            if (
                req.method === "GET" &&
                req.url === "/api/test"
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    }
                );

                res.end(
                    JSON.stringify({
                        success: true,
                        message:
                            "KAJAPAN Backend aktif! 🇯🇵"
                    })
                );

                return;

            }


            // ==================================
            // SUBTITLE API
            // ==================================

            if (
                req.method === "POST" &&
                req.url === "/api/subtitles"
            ) {

                let body = "";

                req.on(
                    "data",
                    chunk => {

                        body += chunk;

                    }
                );

                req.on(
                    "end",
                    () => {

                        try {

                            const data =
                                JSON.parse(body);

                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "application/json; charset=utf-8"
                                }
                            );

                            res.end(
                                JSON.stringify({
                                    success: true,
                                    message:
                                        "Subtitle berhasil diterima!",
                                    subtitles:
                                        data.subtitles || []
                                })
                            );

                        } catch (error) {

                            res.writeHead(
                                400,
                                {
                                    "Content-Type":
                                        "application/json; charset=utf-8"
                                }
                            );

                            res.end(
                                JSON.stringify({
                                    success: false,
                                    message:
                                        "Data JSON tidak valid."
                                })
                            );

                        }

                    }
                );

                return;

            }



            // ==================================
            // AUTO FETCH YOUTUBE SUBTITLES
            // ==================================

            if (
                req.method === "POST" &&
                req.url === "/api/fetch-subtitles"
            ) {
                let body = "";

                req.on("data", chunk => {
                    body += chunk;
                });

                req.on("end", () => {
                    let tempDir = "";

                    const { execFile } = require("child_process");

                    try {
                        const data = JSON.parse(body);
                        const videoId = String(data.videoId || "").trim();

                        if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                            res.writeHead(400, {
                                "Content-Type": "application/json; charset=utf-8"
                            });
                            res.end(JSON.stringify({
                                success: false,
                                message: "ID video YouTube tidak valid."
                            }));
                            return;
                        }

                        tempDir = path.join(
                            __dirname,
                            "kajapan-temp-" + Date.now()
                        );

                        fs.mkdirSync(tempDir, { recursive: true });

                        const output = path.join(
                            tempDir,
                            "subtitle.%(ext)s"
                        );

                        execFile("python", [
                            "-m", "yt_dlp",
                            "--remote-components", "ejs:github",
                            "--skip-download",
                            "--write-subs",
                            "--write-auto-subs",
                            "--sub-langs", "ja-orig,ja",
                            "--sub-format", "vtt",
                            "--output", output,
                            "https://www.youtube.com/watch?v=" + videoId
                        ], {
                            timeout: 120000
                        }, (error) => {
                            try {
                                if (error) {
                                    res.writeHead(502, {
                                        "Content-Type": "application/json; charset=utf-8"
                                    });
                                    res.end(JSON.stringify({
                                        success: false,
                                        message: "Gagal mengambil subtitle. Video mungkin tidak menyediakan subtitle Jepang."
                                    }));
                                    return;
                                }

                                const files = fs.readdirSync(tempDir);

                                const subtitleFile =
                                    files.find(f => f.endsWith(".ja-orig.vtt")) ||
                                    files.find(f => f.endsWith(".ja.vtt"));

                                if (!subtitleFile) {
                                    res.writeHead(404, {
                                        "Content-Type": "application/json; charset=utf-8"
                                    });
                                    res.end(JSON.stringify({
                                        success: false,
                                        message: "Subtitle Jepang tidak ditemukan."
                                    }));
                                    return;
                                }

                                const vtt = fs.readFileSync(
                                    path.join(tempDir, subtitleFile),
                                    "utf8"
                                );

                                const blocks = vtt.split(/\r?\n\r?\n/);
                                const subtitles = [];

                                for (const block of blocks) {
                                    const lines = block.split(/\r?\n/);
                                    const timeLine = lines.find(
                                        line => line.includes("-->")
                                    );

                                    if (!timeLine) continue;

                                    const times = timeLine.split("-->");
                                    const start = times[0].trim();
                                    const end = times[1].trim().split(/\s+/)[0];

                                    const toSeconds = value => {
                                        const parts = value.split(":");
                                        return parts.reduce(
                                            (total, part) =>
                                                total * 60 + parseFloat(part),
                                            0
                                        );
                                    };

                                    const japanese = lines
                                        .filter(line => !line.includes("-->"))
                                        .join(" ")
                                        .replace(/<[^>]*>/g, "")
                                        .replace(/&amp;/g, "&")
                                        .replace(/&lt;/g, "<")
                                        .replace(/&gt;/g, ">")
                                        .replace(/\[[^\]]*\]/g, "")
                                        .replace(/\s+/g, " ")
                                        .trim();

                                    if (
                                        japanese &&
                                        /[\u3040-\u30ff\u3400-\u9fff]/.test(japanese)
                                    ) {
                                        const last = subtitles[subtitles.length - 1];

                                        if (last && last.japanese === japanese) {
                                            last.end = toSeconds(end);
                                        } else {
                                            subtitles.push({
                                                start: toSeconds(start),
                                                end: toSeconds(end),
                                                japanese,
                                                romaji: "",
                                                indonesia: ""
                                            });
                                        }
                                    }
                                }

                                res.writeHead(200, {
                                    "Content-Type": "application/json; charset=utf-8"
                                });

                                res.end(JSON.stringify({
                                    success: true,
                                    subtitles
                                }));

                            } catch (err) {
                                if (!res.headersSent) {
                                    res.writeHead(500, {
                                        "Content-Type": "application/json; charset=utf-8"
                                    });
                                    res.end(JSON.stringify({
                                        success: false,
                                        message: "Gagal membaca file subtitle."
                                    }));
                                }
                            } finally {
                                try {
                                    fs.rmSync(tempDir, {
                                        recursive: true,
                                        force: true
                                    });
                                } catch (_) {}
                            }
                        });

                    } catch (err) {
                        res.writeHead(400, {
                            "Content-Type": "application/json; charset=utf-8"
                        });
                        res.end(JSON.stringify({
                            success: false,
                            message: "Permintaan tidak valid."
                        }));
                    }
                });

                return;
            }
            // ==================================
            // TRANSLATE API
            // ==================================

            if (
                req.method === "POST" &&
                req.url === "/api/translate"
            ) {

                let body = "";

                req.on(
                    "data",
                    chunk => {

                        body += chunk;

                    }
                );

                req.on(
                    "end",
                    async () => {

                        try {

                            const data =
                                JSON.parse(body);

                            const japanese =
                                (
                                    data.japanese ||
                                    ""
                                ).trim();


                            if (!japanese) {

                                res.writeHead(
                                    400,
                                    {
                                        "Content-Type":
                                            "application/json; charset=utf-8"
                                    }
                                );

                                res.end(
                                    JSON.stringify({
                                        success: false,
                                        message:
                                            "Teks Jepang kosong."
                                    })
                                );

                                return;

                            }


                            // ==============================
                            // KUROSHIRO BELUM SIAP
                            // ==============================

                            if (!kuroshiroReady) {

                                res.writeHead(
                                    503,
                                    {
                                        "Content-Type":
                                            "application/json; charset=utf-8"
                                    }
                                );

                                res.end(
                                    JSON.stringify({
                                        success: false,
                                        message:
                                            "Romaji engine masih memuat. Coba lagi sebentar."
                                    })
                                );

                                return;

                            }


                            // ==============================
                            // JEPANG → ROMAJI
                            // ==============================

                            let romaji =
                                await kuroshiro.convert(
                                    japanese,
                                    {
                                        to: "romaji",
                                        mode: "spaced"
                                    }
                                );


                            romaji =
                                romaji
                                    .replace(
                                        /\s+([。、！？,.!?])/g,
                                        "$1"
                                    )
                                    .replace(
                                        /\bshi\s+te\s+i\s+masu\b/gi,
                                        "shiteimasu"
                                    )
                                    .replace(
                                        /\bde\s+wa\b/gi,
                                        "dewa"
                                    )
                                    .replace(
                                        /\bja\s+na\s+i\b/gi,
                                        "janai"
                                    )
                                    .replace(
                                        /\s{2,}/g,
                                        " "
                                    )
                                    .trim();


                            // ==============================
                            // JEPANG → INDONESIA
                            // ==============================

                            const translateUrl =
                                "https://api.mymemory.translated.net/get?" +
                                "q=" +
                                encodeURIComponent(
                                    japanese
                                ) +
                                "&langpair=ja|id";


                            const translateResponse =
                                await fetch(
                                    translateUrl
                                );


                            const translateData =
                                await translateResponse.json();


                            if (
                                !translateResponse.ok ||
                                translateData.responseStatus !== 200
                            ) {

                                res.writeHead(
                                    502,
                                    {
                                        "Content-Type":
                                            "application/json; charset=utf-8"
                                    }
                                );

                                res.end(
                                    JSON.stringify({
                                        success: false,
                                        message:
                                            "Translator gagal memproses teks."
                                    })
                                );

                                return;

                            }


                            const indonesia =
                                translateData
                                    .responseData
                                    ?.translatedText || "";


                            // ==============================
                            // RESPONSE
                            // ==============================

                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "application/json; charset=utf-8"
                                }
                            );

                            res.end(
                                JSON.stringify({

                                    success: true,

                                    japanese:
                                        japanese,

                                    romaji:
                                        romaji,

                                    indonesia:
                                        indonesia

                                })
                            );


                        } catch (error) {

                            console.error(
                                "Translation error:",
                                error
                            );

                            res.writeHead(
                                500,
                                {
                                    "Content-Type":
                                        "application/json; charset=utf-8"
                                }
                            );

                            res.end(
                                JSON.stringify({
                                    success: false,
                                    message:
                                        "Terjadi kesalahan pada server."
                                })
                            );

                        }

                    }
                );

                return;

            }


            // ==================================
            // WEBSITE KAJAPAN
            // ==================================

            if (
                req.method === "GET"
            ) {

                let requestedPath =
                    req.url.split("?")[0];


                if (
                    requestedPath === "/"
                ) {

                    requestedPath =
                        "/index.html";

                }


                const filePath =
                    path.join(
                        __dirname,
                        "..",
                        requestedPath
                    );


                // Cegah akses keluar folder
                const publicRoot =
                    path.resolve(
                        __dirname,
                        ".."
                    );

                const safePath =
                    path.resolve(
                        filePath
                    );


                if (
                    !safePath.startsWith(
                        publicRoot
                    )
                ) {

                    res.writeHead(403);

                    res.end(
                        "Forbidden"
                    );

                    return;

                }


                fs.readFile(
                    safePath,
                    (error, data) => {

                        if (error) {

                            res.writeHead(
                                404,
                                {
                                    "Content-Type":
                                        "text/plain; charset=utf-8"
                                }
                            );

                            res.end(
                                "File tidak ditemukan."
                            );

                            return;

                        }


                        res.writeHead(
                            200,
                            {
                                "Content-Type":
                                    getContentType(
                                        safePath
                                    ),

                                "Cache-Control":
                                    "no-cache"
                            }
                        );


                        res.end(data);

                    }
                );

                return;

            }


            // ==================================
            // 404 API
            // ==================================

            res.writeHead(
                404,
                {
                    "Content-Type":
                        "application/json; charset=utf-8"
                }
            );

            res.end(
                JSON.stringify({
                    success: false,
                    message:
                        "Endpoint tidak ditemukan."
                })
            );

        }
    );


// ======================================
// START SERVER
// ======================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🌸 KAJAPAN berjalan di http://127.0.0.1:${PORT}`
        );

    }
);
