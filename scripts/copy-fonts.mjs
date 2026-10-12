/**
 * فونت‌های همراه برنامه (Google Fonts، مجوز OFL / Apache / UFL)
 * ─────────────────────────────────────────────────────────────
 * یک بار هنگام بیلد فایل‌های TTF را در public/webfonts می‌گذارد تا داخل APK و نسخهٔ وب
 * باشند (گوشی بدون اینترنت هم همان فونت‌ها را دارد). همین فایل‌ها هم برای متن روی بوم
 * (موشن‌اسکریپت، pycairo)، هم صفحه‌های HTML وارد‌شده (به‌جای fonts.googleapis.com) و هم
 * پایتون واقعی (PIL ImageFont، matplotlib، pygame) استفاده می‌شوند.
 * فهرست در public/webfonts/fonts.json نوشته می‌شود. اگر فایلی گرفته نشد فقط هشدار می‌دهد.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DST = 'public/webfonts';
const RAW = 'https://raw.githubusercontent.com/google/fonts/main/';
/** [خانواده، مسیرها در مخزن google/fonts] */
const FONTS = [
  // بدون‌سریف
  ['Inter', 'ofl/inter/Inter[opsz,wght].ttf', 'ofl/inter/Inter-Italic[opsz,wght].ttf'],
  ['Inter Tight', 'ofl/intertight/InterTight[wght].ttf'],
  ['Roboto', 'ofl/roboto/Roboto[wdth,wght].ttf', 'ofl/roboto/Roboto-Italic[wdth,wght].ttf'],
  ['Roboto Condensed', 'ofl/robotocondensed/RobotoCondensed[wght].ttf'],
  ['Open Sans', 'ofl/opensans/OpenSans[wdth,wght].ttf'],
  ['Noto Sans', 'ofl/notosans/NotoSans[wdth,wght].ttf'],
  ['Montserrat', 'ofl/montserrat/Montserrat[wght].ttf', 'ofl/montserrat/Montserrat-Italic[wght].ttf'],
  ['Poppins', ...['Thin', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black', 'Italic', 'BoldItalic'].map(w => `ofl/poppins/Poppins-${w}.ttf`)],
  ['Lato', ...['Light', 'Regular', 'Bold', 'Black', 'Italic'].map(w => `ofl/lato/Lato-${w}.ttf`)],
  ['Raleway', 'ofl/raleway/Raleway[wght].ttf'],
  ['DM Sans', 'ofl/dmsans/DMSans[opsz,wght].ttf'],
  ['Manrope', 'ofl/manrope/Manrope[wght].ttf'],
  ['Space Grotesk', 'ofl/spacegrotesk/SpaceGrotesk[wght].ttf'],
  ['Work Sans', 'ofl/worksans/WorkSans[wght].ttf'],
  ['Nunito', 'ofl/nunito/Nunito[wght].ttf'],
  ['Rubik', 'ofl/rubik/Rubik[wght].ttf'],
  ['Sora', 'ofl/sora/Sora[wght].ttf'],
  ['Outfit', 'ofl/outfit/Outfit[wght].ttf'],
  ['Syne', 'ofl/syne/Syne[wght].ttf'],
  ['Unbounded', 'ofl/unbounded/Unbounded[wght].ttf'],
  ['Lexend', 'ofl/lexend/Lexend[wght].ttf'],
  ['Figtree', 'ofl/figtree/Figtree[wght].ttf'],
  ['Geist', 'ofl/geist/Geist[wght].ttf'],
  ['Mulish', 'ofl/mulish/Mulish[wght].ttf'],
  ['Plus Jakarta Sans', 'ofl/plusjakartasans/PlusJakartaSans[wght].ttf'],
  ['Epilogue', 'ofl/epilogue/Epilogue[wght].ttf'],
  ['IBM Plex Sans', 'ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf'],
  ['Archivo', 'ofl/archivo/Archivo[wdth,wght].ttf'],
  ['Archivo Black', 'ofl/archivoblack/ArchivoBlack-Regular.ttf'],
  ['Barlow', ...['Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'].map(w => `ofl/barlow/Barlow-${w}.ttf`)],
  ['Bricolage Grotesque', 'ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf'],
  ['Josefin Sans', 'ofl/josefinsans/JosefinSans[wght].ttf'],
  ['Quicksand', 'ofl/quicksand/Quicksand[wght].ttf'],
  ['Comfortaa', 'ofl/comfortaa/Comfortaa[wght].ttf'],
  ['Fredoka', 'ofl/fredoka/Fredoka[wdth,wght].ttf'],
  ['Kanit', 'ofl/kanit/Kanit-Regular.ttf', 'ofl/kanit/Kanit-Bold.ttf'],
  ['Exo 2', 'ofl/exo2/Exo2[wght].ttf'],
  ['Titillium Web', 'ofl/titilliumweb/TitilliumWeb-Regular.ttf', 'ofl/titilliumweb/TitilliumWeb-Bold.ttf'],
  ['Ubuntu', 'ufl/ubuntu/Ubuntu-Regular.ttf', 'ufl/ubuntu/Ubuntu-Bold.ttf'],
  ['Saira', 'ofl/saira/Saira[wdth,wght].ttf'],
  ['Rajdhani', 'ofl/rajdhani/Rajdhani-Regular.ttf', 'ofl/rajdhani/Rajdhani-Bold.ttf'],
  ['Chakra Petch', 'ofl/chakrapetch/ChakraPetch-Regular.ttf', 'ofl/chakrapetch/ChakraPetch-Bold.ttf'],
  // نمایشی / تیتر
  ['Oswald', 'ofl/oswald/Oswald[wght].ttf'],
  ['Bebas Neue', 'ofl/bebasneue/BebasNeue-Regular.ttf'],
  ['Anton', 'ofl/anton/Anton-Regular.ttf'],
  ['Teko', 'ofl/teko/Teko[wght].ttf'],
  ['Big Shoulders Display', 'ofl/bigshouldersdisplay/BigShouldersDisplay[wght].ttf'],
  ['Orbitron', 'ofl/orbitron/Orbitron[wght].ttf'],
  ['Audiowide', 'ofl/audiowide/Audiowide-Regular.ttf'],
  ['Michroma', 'ofl/michroma/Michroma-Regular.ttf'],
  ['Russo One', 'ofl/russoone/RussoOne-Regular.ttf'],
  ['Black Ops One', 'ofl/blackopsone/BlackOpsOne-Regular.ttf'],
  ['Bungee', 'ofl/bungee/Bungee-Regular.ttf'],
  ['Righteous', 'ofl/righteous/Righteous-Regular.ttf'],
  ['Monoton', 'ofl/monoton/Monoton-Regular.ttf'],
  ['Bangers', 'ofl/bangers/Bangers-Regular.ttf'],
  ['Luckiest Guy', 'apache/luckiestguy/LuckiestGuy-Regular.ttf'],
  ['Creepster', 'ofl/creepster/Creepster-Regular.ttf'],
  ['Alfa Slab One', 'ofl/alfaslabone/AlfaSlabOne-Regular.ttf'],
  ['Abril Fatface', 'ofl/abrilfatface/AbrilFatface-Regular.ttf'],
  ['Shrikhand', 'ofl/shrikhand/Shrikhand-Regular.ttf'],
  ['Press Start 2P', 'ofl/pressstart2p/PressStart2P-Regular.ttf'],
  ['VT323', 'ofl/vt323/VT323-Regular.ttf'],
  ['Silkscreen', 'ofl/silkscreen/Silkscreen-Regular.ttf'],
  // دست‌نویس
  ['Pacifico', 'ofl/pacifico/Pacifico-Regular.ttf'],
  ['Lobster', 'ofl/lobster/Lobster-Regular.ttf'],
  ['Dancing Script', 'ofl/dancingscript/DancingScript[wght].ttf'],
  ['Caveat', 'ofl/caveat/Caveat[wght].ttf'],
  ['Permanent Marker', 'apache/permanentmarker/PermanentMarker-Regular.ttf'],
  ['Satisfy', 'apache/satisfy/Satisfy-Regular.ttf'],
  ['Great Vibes', 'ofl/greatvibes/GreatVibes-Regular.ttf'],
  ['Kalam', 'ofl/kalam/Kalam-Regular.ttf'],
  ['Gloria Hallelujah', 'ofl/gloriahallelujah/GloriaHallelujah.ttf'],
  // سریف
  ['Playfair Display', 'ofl/playfairdisplay/PlayfairDisplay[wght].ttf', 'ofl/playfairdisplay/PlayfairDisplay-Italic[wght].ttf'],
  ['Instrument Serif', 'ofl/instrumentserif/InstrumentSerif-Regular.ttf', 'ofl/instrumentserif/InstrumentSerif-Italic.ttf'],
  ['DM Serif Display', 'ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf'],
  ['Lora', 'ofl/lora/Lora[wght].ttf'],
  ['Noto Serif', 'ofl/notoserif/NotoSerif[wdth,wght].ttf'],
  ['EB Garamond', 'ofl/ebgaramond/EBGaramond[wght].ttf'],
  ['Cormorant Garamond', 'ofl/cormorantgaramond/CormorantGaramond[wght].ttf'],
  ['Libre Baskerville', 'ofl/librebaskerville/LibreBaskerville[wght].ttf'],
  ['Spectral', 'ofl/spectral/Spectral-Regular.ttf', 'ofl/spectral/Spectral-Bold.ttf'],
  ['Roboto Slab', 'apache/robotoslab/RobotoSlab[wght].ttf'],
  // تک‌فاصله
  ['JetBrains Mono', 'ofl/jetbrainsmono/JetBrainsMono[wght].ttf'],
  ['Fira Code', 'ofl/firacode/FiraCode[wght].ttf'],
  ['Roboto Mono', 'ofl/robotomono/RobotoMono[wght].ttf'],
  ['Source Code Pro', 'ofl/sourcecodepro/SourceCodePro[wght].ttf'],
  ['Space Mono', 'ofl/spacemono/SpaceMono-Regular.ttf', 'ofl/spacemono/SpaceMono-Bold.ttf'],
  ['IBM Plex Mono', 'ofl/ibmplexmono/IBMPlexMono-Regular.ttf', 'ofl/ibmplexmono/IBMPlexMono-Bold.ttf'],
  ['DM Mono', 'ofl/dmmono/DMMono-Regular.ttf', 'ofl/dmmono/DMMono-Medium.ttf'],
  ['Geist Mono', 'ofl/geistmono/GeistMono[wght].ttf'],
  ['Share Tech Mono', 'ofl/sharetechmono/ShareTechMono-Regular.ttf'],
  ['Major Mono Display', 'ofl/majormonodisplay/MajorMonoDisplay-Regular.ttf'],
  // جایگزین هم‌اندازهٔ فونت‌های سیستمی (Arial، Times، Courier)
  ['Arimo', 'ofl/arimo/Arimo[wght].ttf'],
  ['Tinos', 'ofl/tinos/Tinos-Regular.ttf', 'ofl/tinos/Tinos-Bold.ttf'],
  ['Cousine', 'ofl/cousine/Cousine-Regular.ttf', 'ofl/cousine/Cousine-Bold.ttf'],
  // فارسی و عربی
  ['Vazirmatn', 'ofl/vazirmatn/Vazirmatn[wght].ttf'],
  ['Noto Sans Arabic', 'ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf'],
  ['Noto Naskh Arabic', 'ofl/notonaskharabic/NotoNaskhArabic[wght].ttf'],
  ['Lalezar', 'ofl/lalezar/Lalezar-Regular.ttf'],
  ['Cairo', 'ofl/cairo/Cairo[slnt,wght].ttf'],
  ['Tajawal', 'ofl/tajawal/Tajawal-Regular.ttf', 'ofl/tajawal/Tajawal-Bold.ttf'],
  ['Almarai', 'ofl/almarai/Almarai-Regular.ttf', 'ofl/almarai/Almarai-Bold.ttf'],
  ['Changa', 'ofl/changa/Changa[wght].ttf'],
  ['El Messiri', 'ofl/elmessiri/ElMessiri[wght].ttf'],
  ['Reem Kufi', 'ofl/reemkufi/ReemKufi[wght].ttf'],
  ['Amiri', 'ofl/amiri/Amiri-Regular.ttf', 'ofl/amiri/Amiri-Bold.ttf'],
  ['Lemonada', 'ofl/lemonada/Lemonada[wght].ttf'],
  ['Markazi Text', 'ofl/markazitext/MarkaziText[wght].ttf'],
  ['Rakkas', 'ofl/rakkas/Rakkas-Regular.ttf'],
  // خط‌های دیگر
  ['Noto Sans Hebrew', 'ofl/notosanshebrew/NotoSansHebrew[wdth,wght].ttf'],
  ['Noto Sans Devanagari', 'ofl/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf'],
  ['Noto Sans Thai', 'ofl/notosansthai/NotoSansThai[wdth,wght].ttf'],
];
/** نام‌های رایج فونت‌های سیستمی ← فونت همراه شبیه به آن */
const ALIASES = {
  'Arial': 'Arimo', 'Helvetica': 'Arimo', 'Helvetica Neue': 'Arimo', 'Liberation Sans': 'Arimo', 'FreeSans': 'Arimo', 'Arial Black': 'Archivo Black',
  'Times New Roman': 'Tinos', 'Times': 'Tinos', 'Liberation Serif': 'Tinos', 'Georgia': 'Noto Serif', 'Garamond': 'EB Garamond',
  'Courier New': 'Cousine', 'Courier': 'Cousine', 'Liberation Mono': 'Cousine', 'Consolas': 'JetBrains Mono', 'Menlo': 'JetBrains Mono', 'Monaco': 'JetBrains Mono', 'SF Mono': 'JetBrains Mono',
  'DejaVu Sans': 'Noto Sans', 'Verdana': 'Noto Sans', 'Tahoma': 'Noto Sans', 'Segoe UI': 'Inter', 'SF Pro Display': 'Inter', 'SF Pro Text': 'Inter', 'SF Pro': 'Inter', '-apple-system': 'Inter', 'system-ui': 'Inter',
  'DejaVu Sans Mono': 'JetBrains Mono', 'DejaVu Serif': 'Noto Serif', 'Impact': 'Anton', 'Futura': 'Outfit', 'Gill Sans': 'Lato', 'Avenir': 'Nunito', 'Avenir Next': 'Nunito', 'Proxima Nova': 'Montserrat',
  'Vazir': 'Vazirmatn', 'B Nazanin': 'Vazirmatn', 'IRANSans': 'Vazirmatn', 'Shabnam': 'Vazirmatn', 'Sahel': 'Vazirmatn', 'Samim': 'Vazirmatn', 'Yekan': 'Vazirmatn',
};
const WEIGHTS = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };

/** بازهٔ محور wght فونت متغیر از جدول fvar */
function wghtRange(buf) {
  try {
    const n = buf.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (buf.toString('latin1', o, o + 4) !== 'fvar') continue;
      const t = buf.readUInt32BE(o + 8), axOff = buf.readUInt16BE(t + 4), cnt = buf.readUInt16BE(t + 8), size = buf.readUInt16BE(t + 10);
      for (let a = 0; a < cnt; a++) {
        const p = t + axOff + a * size;
        if (buf.toString('latin1', p, p + 4) === 'wght') return [buf.readInt32BE(p + 4) / 65536, buf.readInt32BE(p + 12) / 65536];
      }
    }
  } catch { /* */ }
  return null;
}

mkdirSync(DST, { recursive: true });
const faces = [];
let bytes = 0, fail = 0;
for (const [family, ...paths] of FONTS) {
  for (const p of paths) {
    const base = p.split('/').pop(), file = base.replace(/[[\],]/g, m => (m === ',' ? '-' : '_')).replace(/_\.ttf$/, '.ttf').replace(/_$/, '');
    const out = join(DST, file);
    try {
      if (!existsSync(out) || readFileSync(out).length < 1000) {
        const r = await fetch(RAW + p.split('/').map(encodeURIComponent).join('/'));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      }
      const buf = readFileSync(out);
      bytes += buf.length;
      const style = /Italic/.test(base) ? 'italic' : 'normal';
      const rg = /\[[^\]]*wght/.test(base) ? wghtRange(buf) : null;
      const wn = base.replace(/\.ttf$/, '').split('-').pop().replace(/\[.*$/, '').replace(/Italic$/, '').toLowerCase();
      const weight = rg ? `${Math.round(rg[0])} ${Math.round(rg[1])}` : String(WEIGHTS[wn || 'regular'] ?? 400);
      faces.push({ family, file, weight, style });
    } catch (e) {
      fail++;
      console.warn(`⚠ فونت ${family} (${base}) گرفته نشد: ${e.message}`);
    }
  }
}
writeFileSync(join(DST, 'fonts.json'), JSON.stringify({ faces, aliases: ALIASES }, null, 1));
console.log(`✓ ${new Set(faces.map(f => f.family)).size} خانوادهٔ فونت (${faces.length} فایل، ${(bytes / 1e6).toFixed(1)} MB) ← ${DST}${fail ? ` — ${fail} فایل گرفته نشد` : ''}`);
