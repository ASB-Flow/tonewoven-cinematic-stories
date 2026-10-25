# VoiceFlow AI

You are a senior full-stack engineer, AI audio specialist, and product designer.

Your task is to design and implement a web platform that transforms a text script into a fully produced motivational video while preserving the ORIGINAL VOICE TONE, RHYTHM, AND EMOTIONAL DELIVERY.

The system must NOT clone voices, but it MUST replicate:
- speaking pace
- emotional intensity
- pause structure
- emphasis patterns
- cinematic delivery style

---

### CORE OBJECTIVE
Build a platform where a user can:
- Paste a script
- Upload or reference an original audio track (optional but recommended)
- Generate a new language version of the video (e.g. English → French)
- Keep the SAME delivery style as the original voice

---

### USER FLOW
1. User signs up / logs in
2. User pastes the script
3. (Optional) User uploads original audio (reference voice)
4. User selects:
   - Target language
   - Voice gender
   - Intensity level (low / medium / high)
   - Video format (YouTube / Shorts)
5. User clicks “Generate Video”
6. System analyzes original voice style
7. System generates a new voiceover with the SAME tone
8. Video is assembled and delivered

---

### VOICE STYLE PRESERVATION PIPELINE

#### 1. Voice Analysis (Reference-Based)
If original audio is provided:
- Analyze:
  - speech tempo (words per minute)
  - pause duration and placement
  - pitch variance (calm vs intense)
  - emphasis points
- Extract a “Voice Style Profile”

If no audio is provided:
- Use predefined cinematic voice profiles:
  - Motivational / Deep / Calm / Intense

---

#### 2. Script Re-Timing
- Align translated script duration with original pacing
- Insert intentional pauses
- Mark emphasis words
- Ensure emotional beats are preserved

---

#### 3. Tone-Matched TTS
- Use TTS providers that support:
  - prosody control
  - emphasis tags
  - pause control
- Recommended providers:
  - ElevenLabs (style similarity, stability tuning)
  - PlayHT (emphasis & speed control)

The system must:
- Lock speaking speed
- Preserve pause structure
- Match emotional arc

---

### VIDEO GENERATION PIPELINE
1. Split script by emotional beats
2. Generate cinematic visual prompts per segment
3. Fetch royalty-free stock videos (Pexels, Pixabay, Mixkit)
4. Apply slow zoom, light motion, crossfades
5. Add cinematic background music
6. Automatically duck music under voice
7. Export 1080p video

---

### TECH STACK
- Frontend: React + Tailwind
- Backend: Node.js (NestJS preferred)
- Audio analysis: Python microservice (Librosa)
- Video assembly: FFmpeg
- Storage: S3-compatible
- Queue: Redis + BullMQ

---

### UX REQUIREMENTS
- Progress bar with pipeline steps
- Preview voice-only before full render
- Ability to regenerate voice with same tone
- Clean, minimal, professional UI

---

### MONETIZATION READY
- Credit-based usage
- Premium access to “tone preservation”
- Admin panel with usage analytics

---

### OUTPUT EXPECTATIONS
Generate:
- Full backend architecture
- Audio style extraction logic
- TTS abstraction layer
- FFmpeg assembly pipeline
- Database schema
- Clear documentation

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tonewoven-cinematic-stories.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2e9abe86-b816-415c-9be1-c884d02f4e6e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
