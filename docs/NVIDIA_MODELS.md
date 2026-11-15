# NVIDIA API Catalog compatibility

Checked 2026-11-15. NVIDIA advertises free hosted inference at https://build.nvidia.com/. The hosted endpoint is `https://integrate.api.nvidia.com/v1` and supports OpenAI-compatible transport. A Mivuneko adapter is feasible, but tool calling, vision inputs and structured action responses must be evaluated per model. This investigation does not add a provider or validate an account key.

Free trial access is not a promise of unlimited production hosting. The published API Trial Terms, sections 1.2 and 1.4, limit trial use to internal testing/evaluation and require a separate arrangement for production. Account-specific quotas and each model's current terms must be checked when enabling the provider. Downloadable weights have separate licenses and hardware requirements.

Sources:

- https://build.nvidia.com/
- https://docs.nvidia.com/aiq-blueprint/2.2.0/customization/swapping-models.html
- https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf
