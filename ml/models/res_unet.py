import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualBlock(nn.Module):
    """Residual convolutional block with GroupNorm and residual projection if channels change."""
    def __init__(self, in_channels, out_channels, dilation=1):
        super().__init__()
        groups = 8 if out_channels >= 8 else 1
        self.conv1 = nn.Conv2d(
            in_channels, out_channels, 3,
            padding=dilation, dilation=dilation, bias=False
        )
        self.gn1 = nn.GroupNorm(groups, out_channels)
        self.act1 = nn.ReLU(inplace=True)

        self.conv2 = nn.Conv2d(
            out_channels, out_channels, 3,
            padding=dilation, dilation=dilation, bias=False
        )
        self.gn2 = nn.GroupNorm(groups, out_channels)
        self.act2 = nn.ReLU(inplace=True)

        if in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 1, bias=False),
                nn.GroupNorm(groups, out_channels)
            )
        else:
            self.shortcut = nn.Identity()

    def forward(self, x):
        res = self.shortcut(x)
        out = self.act1(self.gn1(self.conv1(x)))
        out = self.gn2(self.conv2(out))
        return self.act2(out + res)


class MultiscaleBottleneck(nn.Module):
    """Atrous/dilated multiscale block to capture both localized flow and long-range flood waves."""
    def __init__(self, channels):
        super().__init__()
        groups = 8 if (channels // 4) >= 8 else 1
        mid = channels // 4

        self.b0 = nn.Sequential(
            nn.Conv2d(channels, mid, 1, bias=False),
            nn.GroupNorm(groups, mid),
            nn.ReLU(inplace=True)
        )
        self.b1 = nn.Sequential(
            nn.Conv2d(channels, mid, 3, padding=1, dilation=1, bias=False),
            nn.GroupNorm(groups, mid),
            nn.ReLU(inplace=True)
        )
        self.b2 = nn.Sequential(
            nn.Conv2d(channels, mid, 3, padding=2, dilation=2, bias=False),
            nn.GroupNorm(groups, mid),
            nn.ReLU(inplace=True)
        )
        self.b3 = nn.Sequential(
            nn.Conv2d(channels, mid, 3, padding=4, dilation=4, bias=False),
            nn.GroupNorm(groups, mid),
            nn.ReLU(inplace=True)
        )
        self.out_conv = nn.Sequential(
            nn.Conv2d(mid * 4, channels, 1, bias=False),
            nn.GroupNorm(8 if channels >= 8 else 1, channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        f0 = self.b0(x)
        f1 = self.b1(x)
        f2 = self.b2(x)
        f3 = self.b3(x)
        cat = torch.cat([f0, f1, f2, f3], dim=1)
        return self.out_conv(cat) + x


class ResUNet(nn.Module):
    """Residual U-Net (Model C)."""
    def __init__(self, in_channels=7, out_channels=3, base=16):
        super().__init__()
        self.enc1 = ResidualBlock(in_channels, base)
        self.enc2 = ResidualBlock(base, base * 2)
        self.enc3 = ResidualBlock(base * 2, base * 4)
        self.pool = nn.MaxPool2d(2)

        self.bottleneck = ResidualBlock(base * 4, base * 8)

        self.up3 = nn.ConvTranspose2d(base * 8, base * 4, 2, stride=2)
        self.dec3 = ResidualBlock(base * 8, base * 4)

        self.up2 = nn.ConvTranspose2d(base * 4, base * 2, 2, stride=2)
        self.dec2 = ResidualBlock(base * 4, base * 2)

        self.up1 = nn.ConvTranspose2d(base * 2, base, 2, stride=2)
        self.dec1 = ResidualBlock(base * 2, base)

        self.output = nn.Conv2d(base, out_channels, 1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        b = self.bottleneck(self.pool(e3))

        d3 = self.dec3(torch.cat([self.up3(b), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))

        return self.output(d1)


class MultiscaleResUNet(nn.Module):
    """Residual U-Net with Multiscale Dilated Bottleneck (Model D)."""
    def __init__(self, in_channels=7, out_channels=3, base=16):
        super().__init__()
        self.enc1 = ResidualBlock(in_channels, base)
        self.enc2 = ResidualBlock(base, base * 2)
        self.enc3 = ResidualBlock(base * 2, base * 4)
        self.pool = nn.MaxPool2d(2)

        self.bottleneck_res = ResidualBlock(base * 4, base * 8)
        self.bottleneck_ms = MultiscaleBottleneck(base * 8)

        self.up3 = nn.ConvTranspose2d(base * 8, base * 4, 2, stride=2)
        self.dec3 = ResidualBlock(base * 8, base * 4)

        self.up2 = nn.ConvTranspose2d(base * 4, base * 2, 2, stride=2)
        self.dec2 = ResidualBlock(base * 4, base * 2)

        self.up1 = nn.ConvTranspose2d(base * 2, base, 2, stride=2)
        self.dec1 = ResidualBlock(base * 2, base)

        self.output = nn.Conv2d(base, out_channels, 1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))

        b = self.bottleneck_res(self.pool(e3))
        b = self.bottleneck_ms(b)

        d3 = self.dec3(torch.cat([self.up3(b), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))

        return self.output(d1)
