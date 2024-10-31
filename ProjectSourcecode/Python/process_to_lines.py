import cv2
import numpy as np
from typing import List, Tuple, Union
import tensorflow as tf
import pandas as pd
import matplotlib.pyplot as plt

def plot_processed_image(char_img, title="Processed Image"):
    """
    Plots a single processed character image to visualize what is being passed to the model.
    :param char_img: Preprocessed 32x32 numpy array character image
    :param title: Title of the plot
    """
    plt.imshow(char_img.squeeze(), cmap="gray")
    plt.title(title)
    plt.axis("off")
    plt.show()
from PIL import Image, ImageDraw, ImageFont
import random
import math

from torch.ao.quantization.utils import determine_qparams

EquationElement = Union[str, List['EquationElement']]
StructuredEquation = List[EquationElement]
fractionID = 99
def load_symbols_mapping(csv_path):
    symbols_df = pd.read_csv(csv_path)
    return symbols_df.set_index("symbol_id")["latex"].to_dict()

# Specify the path to the symbols CSV and load the mapping
symbols_csv_path = "symbols.csv"  # Replace with actual path
index_to_latex = load_symbols_mapping(symbols_csv_path)

model_path = "./3layer_model_plus_tools/3_layer_model.h5"  # Replace with the actual path to the model file
model = tf.keras.models.load_model(model_path, compile=False)


def resize_image(image: np.ndarray, max_size: Tuple[int, int] = (800, 800)) -> np.ndarray:
    """
    Resize the input image to fit within a max size, preserving aspect ratio.

    :param image: Input image (numpy array)
    :param max_size: Maximum width and height for the output image
    :return: Resized image
    """
    height, width = image.shape[:2]

    # Calculate the scale factor while preserving the aspect ratio
    scale_factor = min(max_size[0] / width, max_size[1] / height)

    # If the image is already smaller than the max size, return it unchanged
    if scale_factor >= 1.0:
        return image

    # Calculate the new dimensions
    new_size = (int(width * scale_factor), int(height * scale_factor))

    # Resize the image using INTER_AREA for downscaling
    resized_image = cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)

    return resized_image


def detect_paper_region(gray_image):
    """
    Detect and crop to just the white paper region in the image with improved edge detection.

    :param gray_image: Grayscale input image
    :return: Cropped image containing just the paper
    """
    # Create a copy to avoid modifying original
    image = gray_image.copy()

    # Increase contrast to make paper edges more visible
    image = cv2.normalize(image, None, 0, 255, cv2.NORM_MINMAX)

    # Apply light blur to reduce noise while preserving edges
    blurred = cv2.GaussianBlur(image, (5, 5), 0)

    # Use adaptive thresholding to handle varying lighting
    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        21,
        5
    )

    # Apply morphological operations to clean up the binary image
    kernel = np.ones((5, 5), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if contours:
        # Find the largest contour (should be the paper)
        paper_contour = max(contours, key=cv2.contourArea)

        # Get image dimensions
        height, width = gray_image.shape
        min_area = 0.4 * height * width  # Paper should be at least 40% of image

        # Check if the contour is large enough to be the paper
        if cv2.contourArea(paper_contour) > min_area:
            # Get approximate polygon
            epsilon = 0.02 * cv2.arcLength(paper_contour, True)
            approx = cv2.approxPolyDP(paper_contour, epsilon, True)

            # If we got a reasonable polygon (4-6 points), use that
            if 4 <= len(approx) <= 6:
                # Get bounding rect of the polygon
                x, y, w, h = cv2.boundingRect(approx)
            else:
                # Fall back to simple bounding rect of contour
                x, y, w, h = cv2.boundingRect(paper_contour)

            # Add small padding
            padding = 10
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(width - x, w + 2 * padding)
            h = min(height - y, h + 2 * padding)

            # Sanity check the crop region
            if w > 100 and h > 100:  # Minimum size check
                # Crop to paper region
                return gray_image[y:y + h, x:x + w]


    border = int(min(gray_image.shape) * 0.05)  # 5% border trim
    return gray_image[border:-border, border:-border]


def preprocess_image(image_path):
    """
    Preprocess the image using adaptive thresholding and noise removal.

    :param image_path: Path to the input image
    :return: Clean binary image with noise removed
    """
    # Step 1: Load and resize the image
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)

    # Step 2: Resize while maintaining aspect ratio
    image = resize_image(image, (1500, 2000))

    # Step 3: Detect and crop to paper region
    image = detect_paper_region(image)

    # Step 4: Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(image, (5, 5), 0)

    # Step 5: Use adaptive thresholding
    binary_image = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11,
        2
    )

    # Step 6: Remove noise using morphological operations
    kernel = np.ones((3, 3), np.uint8)
    clean = cv2.morphologyEx(binary_image, cv2.MORPH_OPEN, kernel)

    # Step 7: Remove isolated pixels using connected components
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(clean, connectivity=8)
    min_size = 30

    clean_binary = np.zeros_like(clean)
    for label in range(1, num_labels):
        if stats[label, cv2.CC_STAT_AREA] >= min_size:
            clean_binary[labels == label] = 255

    return clean_binary

def preprocess_char(char_image, target_size=(32, 32)):
    # Ensure grayscale format
    if len(char_image.shape) > 2:
        char_image = cv2.cvtColor(char_image, cv2.COLOR_BGR2GRAY)

    # Binarize (invert colors if needed for black text on white background)
    _, binary = cv2.threshold(char_image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Find bounding box around the character to crop tightly
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        x, y, w, h = cv2.boundingRect(max(contours, key=cv2.contourArea))
        char_image = binary[y:y + h, x:x + w]
    else:
        char_image = binary

    # Step 1: Resize while preserving aspect ratio
    aspect_ratio = char_image.shape[1] / char_image.shape[0]  # width / height
    if aspect_ratio > 1:  # Wide image
        new_width = target_size[1]
        new_height = int(new_width / aspect_ratio)
    else:  # Tall image
        new_height = target_size[0]
        new_width = int(new_height * aspect_ratio)

    char_image = cv2.resize(char_image, (new_width, new_height), interpolation=cv2.INTER_AREA)

    # Step 2: Add padding to make the image exactly 32x32
    height, width = char_image.shape
    pad_top = (target_size[0] - height) // 2
    pad_bottom = target_size[0] - height - pad_top
    pad_left = (target_size[1] - width) // 2
    pad_right = target_size[1] - width - pad_left

    char_image = cv2.copyMakeBorder(char_image, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_CONSTANT, value=255)

    # Normalize pixel values to the range [0, 1]
    char_image = char_image.astype('float32') / 255

    return char_image

def segment_lines(binary_image: np.ndarray) -> List[np.ndarray]:
    """
    Segment the binary image into individual lines.

    :param binary_image: Clean binary image from preprocess_image
    :return: List of images, each containing a single line
    """
    # Compute horizontal projection profile
    h_proj = np.sum(binary_image, axis=1)

    # Find line boundaries
    line_boundaries = []
    in_line = False
    line_start = 0
    min_line_height = 20

    # Calculate threshold based on average projection value
    threshold = 0.1 * np.max(h_proj)  # Adjust this percentage if needed

    for i, proj in enumerate(h_proj):
        if not in_line and proj > threshold:
            in_line = True
            line_start = i
        elif in_line and proj <= threshold:
            if (i - line_start) >= min_line_height:
                # Add padding to each line
                padding = 10
                start = max(0, line_start - padding)
                end = min(len(h_proj), i + padding)
                line_boundaries.append((start, end))
            in_line = False

    # Handle last line
    if in_line and (len(binary_image) - line_start) >= min_line_height:
        padding = 10
        start = max(0, line_start - padding)
        line_boundaries.append((start, len(binary_image)))

    # Extract lines
    lines = []
    for start, end in line_boundaries:
        line_img = binary_image[start:end, :]

        # Remove empty margins
        col_sums = np.sum(line_img, axis=0)
        non_zero_cols = np.where(col_sums > 0)[0]

        if len(non_zero_cols) > 0:
            left = max(0, non_zero_cols[0] - 5)
            right = min(binary_image.shape[1], non_zero_cols[-1] + 5)
            line_img = line_img[:, left:right]
            lines.append(line_img)

    return lines

def process_handwritten_equation(image_path: str) -> List[np.ndarray]:
    """
    Main function to process a handwritten equation image.

    :param image_path: Path to the input image file
    :return: Tuple containing the preprocessed binary image and a list of line images
    """
    # Preprocess the image
    binary_image = preprocess_image(image_path)

    # Segment into lines
    lines = segment_lines(binary_image)

    return lines


def segment_characters(line_image: np.ndarray) -> List[np.ndarray]:
    """
    Segment a line image into individual characters and ensure each character is resized or padded to 32x32.

    :param line_image: Binary image of a single line
    :return: List of images, each containing a single character, all sized to 32x32
    """
    _, binary = cv2.threshold(line_image, 128, 255, cv2.THRESH_BINARY)
    v_proj = np.sum(binary, axis=0)

    window_size = 5
    min_gap = 10
    char_boundaries = []
    in_char = False
    char_start = 0

    smooth_proj = np.convolve(v_proj, np.ones(window_size) / window_size, mode='same')
    threshold = 0.05 * np.max(smooth_proj)

    for i, proj in enumerate(smooth_proj):
        if not in_char and proj > threshold:
            in_char = True
            char_start = max(0, i - window_size // 2)
        elif in_char and proj <= threshold:
            look_ahead = min(len(smooth_proj), i + min_gap)
            if np.max(smooth_proj[i:look_ahead]) <= threshold:
                char_end = min(binary.shape[1], i + window_size // 2)
                char_start = max(0, char_start - 5)
                char_end = min(binary.shape[1], char_end + 5)
                char_boundaries.append((char_start, char_end))
                in_char = False

    if in_char:
        char_end = binary.shape[1]
        char_boundaries.append((char_start, char_end))

    characters = []
    for start, end in char_boundaries:
        char_img = binary[:, start:end]
        if np.sum(char_img) > 0:
            characters.append(char_img)

    return characters



def predict_character(char_image: np.ndarray) -> int:
    """
    Placeholder function for recognizing a symbol using the appropriate neural network.
    This will be replaced with actual neural network logic later.

    :param char_image: Image of a single character or symbol
    :param category: Category of the symbol ('normal', 'fraction', 'exponent', etc.)
    :return: Recognized symbol or structure
    Use NABLA (upside down triangle) to designate fraction. first parentheiss is top, second is bottom.
    """
    # Placeholder logic - you'll replace this with actual symbol recognition
        # Reshape the character image to add batch and channel dimensions
    ready_img = preprocess_char(char_image, (32,32))
    plot_processed_image(ready_img, title="Processed Input to Model")
    input_data = np.expand_dims(ready_img, axis=(0, -1))  # Shape will be (1, 32, 32, 1)

    # Make a prediction
    model.summary()
    prediction = model.predict(input_data)

    # Get the predicted label (index of the highest probability)
    predicted_label = np.argmax(prediction, axis=1)[0]

    return predicted_label


def predict_line_characters(line_images, return_format="latex"):
    """
    Takes an array of character images from a line, predicts each character, and returns either a list of LaTeX symbols
    or a structured format.

    :param line_images: List of 32x32 character images from a line
    :param return_format: Output format, either "latex" for LaTeX symbols or "structured" for structured parsing
    :return: List of predicted LaTeX symbols or a structured format for the line
    """
    predictions = [predict_character(char_img) for char_img in line_images]

    if return_format == "latex":
        return predictions
    elif return_format == "structured":
        return [{"symbol": symbol, "index": idx} for idx, symbol in enumerate(predictions)]
    else:
        raise ValueError("Invalid return_format. Choose 'latex' or 'structured'.")



def parse_equation(structured_line):
    """
    Parse a structured line of LaTeX symbols into an organized LaTeX string format for equations.

    :param structured_line: List of dictionaries with LaTeX symbols and positions
    :return: Parsed LaTeX equation string
    """
    equation = ""
    for item in structured_line:
        symbol = item["symbol"]
        # Check for special structures like fractions or exponents and adjust syntax
        if symbol == r"\frac":
            # This is a placeholder for handling fractions; insert proper fraction structure
            equation += " \\frac{}{} "  # Placeholder; update with specific logic if needed
        elif symbol == "^":
            equation += "^{}"  # Placeholder for exponent logic
        else:
            equation += f" {symbol} "
    return equation.strip()



#binary, segment lines, for each line, seg chars, then predict line char. Returned a list of predictions. Then, call parse