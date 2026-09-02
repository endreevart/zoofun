Shader "VirtualZoo/CreatureCard"
{
    Properties
    {
        _BaseMap ("Albedo", 2D) = "white" {}
        _BaseColor ("Color", Color) = (1,1,1,1)
        _SideColor ("Side", Color) = (0.45, 0.32, 0.24, 1)
        _Cutoff ("Alpha Cutoff", Range(0,1)) = 0.32
        _Wrap ("Light Wrap", Range(0,1)) = 0.38
        _Rim ("Rim", Range(0,1)) = 0.16
        _Fill ("Fill", Range(0,1)) = 0.10
        _Smoothness ("Smoothness", Range(0,1)) = 0.26
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "TransparentCutout"
            "Queue" = "AlphaTest"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Cull Off
            ZWrite On

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile _ _FORWARD_PLUS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fragment _ _SCREEN_SPACE_AMBIENT_OCCLUSION
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                float4 _BaseColor;
                float4 _SideColor;
                float _Cutoff;
                float _Wrap;
                float _Rim;
                float _Fill;
                float _Smoothness;
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
                float3 normalOS : TEXCOORD3;
                float fogFactor : TEXCOORD4;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs pos = GetVertexPositionInputs(input.positionOS.xyz);
                VertexNormalInputs nrm = GetVertexNormalInputs(input.normalOS);
                output.positionCS = pos.positionCS;
                output.positionWS = pos.positionWS;
                output.normalWS = nrm.normalWS;
                output.normalOS = input.normalOS;
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.fogFactor = ComputeFogFactor(pos.positionCS.z);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv);
                float3 nObj = normalize(input.normalOS);
                float front = saturate(abs(nObj.z) * 2.4 - 0.28);
                clip(lerp(1.0, tex.a, front) - _Cutoff);

                float3 albedo = lerp(_SideColor.rgb, tex.rgb * _BaseColor.rgb, front);
                float3 normalWS = normalize(input.normalWS);
                float4 shadowCoord = TransformWorldToShadowCoord(input.positionWS);
                Light light = GetMainLight(shadowCoord);
                float ndotl = saturate(dot(normalWS, light.direction) * (1.0 - _Wrap) + _Wrap);
                float3 ambient = SampleSH(normalWS);
                float3 viewDir = GetWorldSpaceNormalizeViewDir(input.positionWS);
                float spec = pow(saturate(dot(normalWS, normalize(light.direction + viewDir))), 24.0) * _Smoothness * 0.35;
                float rim = pow(1.0 - saturate(dot(normalWS, viewDir)), 2.6) * _Rim;
                float3 fill = _Fill * float3(0.78, 0.66, 0.48);
                float3 color = albedo * (ambient + light.color * ndotl * light.shadowAttenuation + fill);
                color += light.color * spec * light.shadowAttenuation;
                color += light.color * rim;
                uint pixelLightCount = GetAdditionalLightsCount();
                LIGHT_LOOP_BEGIN(pixelLightCount)
                    Light extra = GetAdditionalLight(lightIndex, input.positionWS);
                    float extraNdotl = saturate(dot(normalWS, extra.direction) * (1.0 - _Wrap) + _Wrap);
                    float atten = extra.distanceAttenuation;
                    color += albedo * extra.color * extraNdotl * atten;
                    float extraRim = pow(1.0 - saturate(dot(normalWS, viewDir)), 2.4) * _Rim * atten;
                    color += extra.color * extraRim;
                LIGHT_LOOP_END
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
            ZTest LEqual
            ColorMask 0
            Cull Off

            HLSLPROGRAM
            #pragma vertex ShadowVert
            #pragma fragment ShadowFrag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);
            float4 _BaseMap_ST;
            float _Cutoff;

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
                float3 normalOS : TEXCOORD1;
            };

            float3 _LightDirection;

            Varyings ShadowVert(Attributes input)
            {
                Varyings output;
                float3 positionWS = TransformObjectToWorld(input.positionOS.xyz);
                float3 normalWS = TransformObjectToWorldNormal(input.normalOS);
                float4 positionCS = TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, _LightDirection));
                output.positionCS = positionCS;
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.normalOS = input.normalOS;
                return output;
            }

            half4 ShadowFrag(Varyings input) : SV_Target
            {
                float alpha = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv).a;
                float front = saturate(abs(normalize(input.normalOS).z) * 2.4 - 0.28);
                clip(lerp(1.0, alpha, front) - _Cutoff);
                return 0;
            }
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }
            ZWrite On
            Cull Off

            HLSLPROGRAM
            #pragma vertex DepthVert
            #pragma fragment DepthFrag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);
            float4 _BaseMap_ST;
            float _Cutoff;

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
                float3 normalWS : TEXCOORD1;
                float3 normalOS : TEXCOORD2;
            };

            Varyings DepthVert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.normalOS = input.normalOS;
                return output;
            }

            half4 DepthFrag(Varyings input) : SV_Target
            {
                float alpha = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv).a;
                float front = saturate(abs(normalize(input.normalOS).z) * 2.4 - 0.28);
                clip(lerp(1.0, alpha, front) - _Cutoff);
                return half4(NormalizeNormalPerPixel(normalize(input.normalWS)), 0);
            }
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
