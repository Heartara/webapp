from pathlib import Path
from PIL import Image,ImageOps
import json
R=Path(__file__).resolve().parent.parent;A=R/'assets';manifest={}
for source in sorted(A.iterdir()):
 if source.suffix.lower() not in ['.jpg','.jpeg','.png','.webp'] or '-opt-' in source.stem or source.name.startswith('favicon'):continue
 if source.suffix=='.png':continue # High-resolution oracle source artwork is not needed for page rendering.
 image=ImageOps.exif_transpose(Image.open(source)).convert('RGB');w,h=image.size
 widths=sorted(set([min(320,w),min(640,w),min(960,w)]));variants=[]
 for size in widths:
  target=A/(source.stem+'-opt-'+str(size)+'.webp');image.resize((size,round(h*size/w)),Image.Resampling.LANCZOS).save(target,'WEBP',quality=78,method=6)
  variants.append({'src':'assets/'+target.name,'width':size,'height':round(h*size/w),'bytes':target.stat().st_size})
 manifest['assets/'+source.name]={'width':w,'height':h,'variants':variants}
logo=Image.open(A/'heartara-logo.jpeg').convert('RGBA');logo.resize((192,192),Image.Resampling.LANCZOS).save(A/'favicon.png')
(R/'image-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Optimised',len(manifest),'image sources into',sum(len(x['variants']) for x in manifest.values()),'responsive variants.')
