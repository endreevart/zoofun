Shader "VirtualZoo/PremiumWater"
{
    Properties
    {
        _ShallowColor ("Shallow", Color) = (0.38, 0.86, 0.80, 1)
        _DeepColor ("Deep", Color) = (0.10, 0.48, 0.56, 1)
        _FoamColor ("Foam", Color) = (0.78, 0.95, 0.92, 1)
        _WaveAmp ("Wave Amp", Float) = 0.022
        _WaveSpeed ("Wave Speed", Float) = 0.85
        _Gloss ("Gloss", Range(0,1)) = 0.84
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Opaque"
            "Queue" = "Geometry"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            ZWrite On
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _ShallowColor;
                float4 _DeepColor;
                float4 _FoamColor;
                float _WaveAmp;
                float _WaveSpeed;
                float _Gloss;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float fogFactor : TEXCOORD2;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                float3 pos = input.positionOS.xyz;
                float t = _Time.y * _WaveSpeed;
                pos.y += sin(pos.x * 2.2 + t) * _WaveAmp + cos(pos.z * 1.7 + t * 0.8) * _WaveAmp * 0.65;
                VertexPositionInputs p = GetVertexPositionInputs(pos);
                output.positionCS = p.positionCS;
                output.positionWS = p.positionWS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.fogFactor = ComputeFogFactor(p.positionCS.z);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float3 viewDir = GetWorldSpaceNormalizeViewDir(input.positionWS);
                float3 normalWS = normalize(input.normalWS + float3(
                    sin(input.positionWS.x * 3.1 + _Time.y * 0.9) * 0.07,
                    0,
                    cos(input.positionWS.z * 2.4 + _Time.y * 0.7) * 0.07));
                float fresnel = pow(1.0 - saturate(dot(normalWS, viewDir)), 2.2);
                float depthHint = saturate((-input.positionWS.y + 0.16) * 4.0);
                float4 color = lerp(_ShallowColor, _DeepColor, saturate(depthHint * 0.55 + fresnel * 0.25));
                color.rgb = lerp(color.rgb, _FoamColor.rgb, saturate(fresnel * 1.2 - 0.62) * 0.28);

                Light light = GetMainLight();
                float wrap = saturate(dot(normalWS, light.direction) * 0.55 + 0.45);
                float spec = pow(saturate(dot(normalWS, normalize(light.direction + viewDir))), lerp(28.0, 88.0, _Gloss));
                float3 ambient = SampleSH(normalWS);
                color.rgb = color.rgb * (ambient + light.color * wrap) + light.color * spec * 0.42;
                color.rgb = MixFog(color.rgb, input.fogFactor);
                return half4(color.rgb, 1);
            }
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
