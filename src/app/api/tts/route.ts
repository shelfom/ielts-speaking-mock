import { NextRequest, NextResponse } from 'next/server';
import { TTSClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: string };

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'No text provided for synthesis' },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new TTSClient(config, customHeaders);

    const response = await client.synthesize({
      uid: 'ielts-exam-user',
      text,
      speaker: 'zh_female_vv_uranus_bigtts', // Bilingual Chinese/English voice
      audioFormat: 'mp3',
      sampleRate: 24000,
    });

    return NextResponse.json({
      audioUri: response.audioUri,
      audioSize: response.audioSize,
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { error: 'Speech synthesis failed' },
      { status: 500 }
    );
  }
}
