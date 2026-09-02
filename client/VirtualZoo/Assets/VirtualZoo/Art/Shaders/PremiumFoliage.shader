Shader "VirtualZoo/PremiumFoliage"
{
    Properties
    {
        _BaseMap ("Albedo", 2D) = "white" {}
        _BaseColor ("Color", Color) = (0.32, 0.58, 0.28, 1)
        _SwayAmp ("Sway Amp", Float) = 0.045
        _SwaySpeed ("Sway Speed", Float) = 1.1
        _Wrap ("Light Wrap", Range(0,1)) = 0.42
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
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                float4 _BaseColor;
                float _SwayAmp;
                float _SwaySpeed;
                float _Wrap;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                float3 normalWS : TEXCOORD2;
                float fogFactor : TEXCOORD3;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                float3 pos = input.positionOS.xyz;
                float height = saturate(pos.y * 0.35);
                float phase = _Time.y * _SwaySpeed + pos.x * 1.4 + pos.z * 0.9;
                pos.x += sin(phase) * _SwayAmp * height;
                pos.z += cos(phase * 0.85) * _SwayAmp * 0.6 * height;
                VertexPositionInputs p = GetVertexPositionInputs(pos);
                VertexNormalInputs n = GetVertexNormalInputs(input.normalOS);
                output.positionCS = p.positionCS;
                output.positionWS = p.positionWS;
                output.normalWS = n.normalWS;
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.fogFactor = ComputeFogFactor(p.positionCS.z);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float3 albedo = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv).rgb * _BaseColor.rgb;
                float3 normalWS = normalize(input.normalWS);
                float4 shadowCoord = TransformWorldToShadowCoord(input.positionWS);
                Light light = GetMainLight(shadowCoord);
                float ndotl = saturate(dot(normalWS, light.direction) * (1.0 - _Wrap) + _Wrap);
                float3 ambient = SampleSH(normalWS);
                float3 color = albedo * (ambient + light.color * ndotl * light.shadowAttenuation);
                color = MixFog(color, input.fogFactor);
                return half4(color, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On
            ColorMask 0
            Cull Off

            HLSLPROGRAM
            #pragma vertex ShadowVert
            #pragma fragment ShadowFrag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            float3 _LightDirection;

            float4 ShadowVert(float4 positionOS : POSITION, float3 normalOS : NORMAL) : SV_POSITION
            {
                float3 positionWS = TransformObjectToWorld(positionOS.xyz);
                float3 normalWS = TransformObjectToWorldNormal(normalOS);
                return TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, _LightDirection));
            }

            half4 ShadowFrag() : SV_Target { return 0; }
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
