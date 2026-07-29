from typing import Callable, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn

# from torchmcubes import marching_cubes <-- Comentado para não dar erro

class IsosurfaceHelper(nn.Module):
    points_range: Tuple[float, float] = (0, 1)

    @property
    def grid_vertices(self) -> torch.FloatTensor:
        raise NotImplementedError


class MarchingCubeHelper(IsosurfaceHelper):
    def __init__(self, resolution: int) -> None:
        super().__init__()
        self.resolution = resolution
        self._grid_vertices: Optional[torch.FloatTensor] = None

    @property
    def grid_vertices(self) -> torch.FloatTensor:
        if self._grid_vertices is None:
            # keep the vertices on CPU so that we can support very large resolution
            x, y, z = (
                torch.linspace(*self.points_range, self.resolution),
                torch.linspace(*self.points_range, self.resolution),
                torch.linspace(*self.points_range, self.resolution),
            )
            x, y, z = torch.meshgrid(x, y, z, indexing="ij")
            verts = torch.cat(
                [x.reshape(-1, 1), y.reshape(-1, 1), z.reshape(-1, 1)], dim=-1
            ).reshape(-1, 3)
            self._grid_vertices = verts
        return self._grid_vertices

    def forward(
        self,
        level: torch.FloatTensor,
    ) -> Tuple[torch.FloatTensor, torch.LongTensor]:
        # Inverte o sinal para o marching cubes
        level = -level.view(self.resolution, self.resolution, self.resolution)
        
        # ======================================================================
        # CORREÇÃO AQUI: Substituímos a chamada ao torchmcubes pela biblioteca scikit-image
        # ======================================================================
        import skimage.measure
        level_np = level.detach().cpu().numpy()
        try:
            v_pos, t_pos_idx, _, _ = skimage.measure.marching_cubes(level_np, 0.0)
        except Exception as e:
            print(f"Erro no marching cubes: {e}")
            # Retorna arrays vazios em caso de erro para não quebrar o programa
            return torch.zeros((0, 3), device=level.device), torch.zeros((0, 3), dtype=torch.long, device=level.device)
        
        # Converte de volta para Tensor do PyTorch
        v_pos = torch.from_numpy(v_pos).float()
        t_pos_idx = torch.from_numpy(t_pos_idx.astype(np.int64))
        
        # ======================================================================
        # Ajuste de coordenadas (mesma lógica do original, mas agora compatível)
        # ======================================================================
        v_pos = v_pos[..., [2, 1, 0]]
        v_pos = v_pos / (self.resolution - 1.0)
        return v_pos.to(level.device), t_pos_idx.to(level.device)