from ml.models.unet import UNet
from ml.models.res_unet import ResUNet, MultiscaleResUNet


def get_model(name: str, in_channels: int = 7, out_channels: int = 3, base: int = 16):
    name = name.lower()
    if name in ["unet", "unet_base16", "original"]:
        return UNet(in_channels=in_channels, out_channels=out_channels, base=16)
    elif name in ["unet_base32", "large_unet"]:
        return UNet(in_channels=in_channels, out_channels=out_channels, base=32)
    elif name in ["res_unet", "resunet"]:
        return ResUNet(in_channels=in_channels, out_channels=out_channels, base=base)
    elif name in ["multiscale_res_unet", "multiscale", "ms_res_unet"]:
        return MultiscaleResUNet(in_channels=in_channels, out_channels=out_channels, base=base)
    else:
        raise ValueError(f"Unknown model name: {name}")


__all__ = ["UNet", "ResUNet", "MultiscaleResUNet", "get_model"]
