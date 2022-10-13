import { Skeleton, Box } from "@chakra-ui/react"
import { useState, useRef, useEffect } from "react"
import { Category } from "regl-scatterplot/dist/types"
import { useQuery } from "urql"
import { contextObjectSwitcherAtom, context__categoriesAtom, context__categoryFilterAtom, DataType } from "./atoms"
import { Annotation } from "./types"
import { useAtom } from 'jotai'
import { slice } from "lodash"

export const ImageQuery = `
  query getimage($identifier: String!, $thumbnail: Boolean!, $resolverName: String!, $topOffset: Float, $leftOffset: Float, $cropWidth: Float, $cropHeight: Float) {
    imageResolver(identifier: $identifier, thumbnail: $thumbnail, resolverName: $resolverName, topOffset: $topOffset, leftOffset: $leftOffset, cropWidth: $cropWidth, cropHeight: $cropHeight) {
      imageData
      originalWidth
      originalHeight
    }
  }
`;

interface ImageRendererProps {
  imageUri: string
  bboxesToPlot: Annotation[]
  thumbnail?: boolean
}

interface ImageOnLoad {
  target: HTMLImageElement
}

const ImageRenderer: React.FC<ImageRendererProps> = ({ imageUri, bboxesToPlot, thumbnail = false }) => {
  let [imageDimensions, setImageDimensions] = useState([]) // [width, height]
  let [originalImageDimensions, setOriginalImageDimensions] = useState([]) // [width, height]
  const imageRef = useRef<HTMLImageElement>(null);
  const [categories] = useAtom(context__categoriesAtom)
  const [categoryFilter] = useAtom(context__categoryFilterAtom)

  var hasBoundingBoxes = ((bboxesToPlot[0] !== undefined) && (bboxesToPlot[0].bbox !== undefined))

  // sets image dimensons on load
  const onImgLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // @ts-ignore
    setImageDimensions([event.target.offsetWidth, event.target.offsetHeight])
  };

  // set image dimensions on resize
  useEffect(() => {
    const resizeListener = () => {
      // @ts-ignore
      setImageDimensions([imageRef!.current!.width, imageRef!.current!.height])
    };
    window.addEventListener('resize', resizeListener);
    return () => {
      window.removeEventListener('resize', resizeListener);
    }
  }, [])

  let resolverName = 'filepath'
  if (imageUri.startsWith('train-images-idx3') || imageUri.startsWith('t10k-images-idx3')) resolverName = 'mnist'
  if (imageUri.startsWith('http')) resolverName = 'url'

  let firstAnnotationBbox = null
  let leftOffset
  let topOffset
  let cropWidth
  let cropHeight
  let paddingX
  let paddingY
  var localAnnotationsFirstBbox

  if ((bboxesToPlot.length == 1) && (thumbnail == true) && hasBoundingBoxes) {
    firstAnnotationBbox = bboxesToPlot[0].bbox

    var h = firstAnnotationBbox[3]
    var w = firstAnnotationBbox[2]
    // define our buffer
    var percentageBuffer = .2
    paddingX = w * percentageBuffer
    paddingY = h * percentageBuffer
    // define how much space we want above to to the left of our annotation
    // if this space doesnt exist, pillow on the backend will fill it in
    leftOffset = firstAnnotationBbox[0] - paddingX
    topOffset = firstAnnotationBbox[1] - paddingY
    // define how wide and tall our image should be. the * 2 is for the extra padding on top/bottom, left/right
    // if we want more height or width than exist in the image, pillow will add it for us
    cropWidth = firstAnnotationBbox[2] + (paddingX * 2)
    cropHeight = firstAnnotationBbox[3] + (paddingY * 2)

    localAnnotationsFirstBbox = bboxesToPlot[0].bbox.slice()
    // @ts-ignore
    localAnnotationsFirstBbox = [localAnnotationsFirstBbox[0] - leftOffset, localAnnotationsFirstBbox[1] - topOffset, localAnnotationsFirstBbox[2], localAnnotationsFirstBbox[3]]
  }

  // fetch the image
  const [result, reexecuteQuery] = useQuery({
    query: ImageQuery,
    variables: { "identifier": imageUri, "thumbnail": thumbnail, "resolverName": resolverName, "topOffset": topOffset, "cropWidth": cropWidth, "cropHeight": cropHeight, "leftOffset": leftOffset },
  });

  const { data, fetching, error } = result;

  // set the original image dimensions
  useEffect(() => {
    if (data === undefined) return
    // var imageOriginalDimensions = new Image()
    // imageOriginalDimensions.src = 'data:image/jpeg;base64,' + data.imageResolver.imageData
    if (data && data.imageResolver) {
      // @ts-ignore
      setOriginalImageDimensions([data.imageResolver.originalWidth, data.imageResolver.originalHeight])
    }

  }, [data])

  if (error) return <p>Oh no... {error.message}</p>;

  let boundingBoxes: any[] = []


  if ((bboxesToPlot.length == 1) && (thumbnail == true) && hasBoundingBoxes) {
    // @ts-ignore
    originalImageDimensions = [cropWidth, cropHeight]
  }

  if ((bboxesToPlot.length > 0) && hasBoundingBoxes) {
    boundingBoxes = bboxesToPlot.map((a: any) => scaleToFittedImage(originalImageDimensions, imageDimensions, a))
  }
  if ((boundingBoxes.length == 1) && (thumbnail == true)) {
    // @ts-ignore
    boundingBoxes[0][0] = (paddingX) * boundingBoxes[0][5]// left
    //@ts-ignore
    boundingBoxes[0][1] = (paddingY) * boundingBoxes[0][6] // top
  }

  if (data == undefined) return (<Skeleton width={200} height={200} />)

  return (
    <>
      <img style={{ maxWidth: "100%", maxHeight: "100%" }} ref={imageRef} src={'data:image/jpeg;base64,' + data.imageResolver.imageData} onLoad={onImgLoad} />

      {((imageDimensions.length > 0) && (originalImageDimensions.length > 0)) ?

        <div style={{ backgroundColor: "rgba(255,0,0,0.0)", width: imageDimensions[0], height: imageDimensions[1], position: 'absolute' }}>
          {boundingBoxes.map((a, index) => {
            // @ts-ignore
            let filterCategoryOption = categoryFilter?.options!.find(o => o.id == a[4].category_id)

            return (
              <Box
                key={index}
                _hover={{ zIndex: 999 }} // on hover bring label to the top
                style={{
                  // @ts-ignore
                  left: a[0],
                  // @ts-ignore
                  top: a[1],
                  // @ts-ignore
                  width: a[2],
                  // @ts-ignore
                  height: a[3],
                  position: 'absolute',
                  border: (thumbnail ? "0.5" : "2") + "px solid " + filterCategoryOption?.color,
                  backgroundColor: filterCategoryOption?.color + (thumbnail ? "1A" : "33") // 33 is 20% adds opacity to the hex color, 1A is 10%
                }}
              >
                {!thumbnail ?
                  <Box
                    key={'thumb' + index}
                    style={{
                      position: 'absolute',
                      backgroundColor: filterCategoryOption?.color,
                      color: 'white',
                      top: '-19px',
                      fontSize: '12px',
                      padding: '0px 4px 0px 4px',
                      left: '-2px',
                      fontWeight: "600"
                    }}>
                    {
                      // @ts-ignore
                      categories[a[4].category_id].name
                    }
                  </Box>
                  : null}
              </Box>
            )
          }
          )}
        </div>

        : null}
    </>
  )
}

export default ImageRenderer

function scaleToFittedImage(originalSize: number[], plottedSize: number[], annotation: Annotation) {
  var bbox = annotation.bbox
  var scaleWidth = plottedSize[0] / originalSize[0]
  var scaleHeight = plottedSize[1] / originalSize[1]
  return [
    bbox[0] * scaleWidth,
    bbox[1] * scaleHeight,
    bbox[2] * scaleWidth,
    bbox[3] * scaleHeight,
    annotation,
    scaleWidth,
    scaleHeight
  ]
}