import cv2
import numpy as np
from typing import List, Tuple, Union
import tensorflow as tf

from PIL import Image, ImageDraw, ImageFont
import random
import math

from torch.ao.quantization.utils import determine_qparams

EquationElement = Union[str, List['EquationElement']]
StructuredEquation = List[EquationElement]
fractionID = 99


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

def preprocess_char(char_image, target_size=(40, 40)):

    #grayscale
    if len(char_image.shape) > 2:
        char_image = cv2.cvtColor(char_image, cv2.COLOR_BGR2GRAY)

    # Binarize
    _, binary = cv2.threshold(char_image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # bounding box the char
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        x, y, w, h = cv2.boundingRect(max(contours, key=cv2.contourArea))
        char_image = binary[y:y + h, x:x + w]
    else:
        char_image = binary

    # Pad the image to make it square (TODO: Improve padding)
    height, width = char_image.shape
    if height > width:
        diff = height - width
        pad_left = diff // 2
        pad_right = diff - pad_left
        char_image = cv2.copyMakeBorder(char_image, 0, 0, pad_left, pad_right, cv2.BORDER_CONSTANT, value=0)
    elif width > height:
        diff = width - height
        pad_top = diff // 2
        pad_bottom = diff - pad_top
        char_image = cv2.copyMakeBorder(char_image, pad_top, pad_bottom, 0, 0, cv2.BORDER_CONSTANT, value=0)

    # Resize to target size
    char_image = cv2.resize(char_image, target_size, interpolation=cv2.INTER_AREA)

    # Normalize
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
    Segment a line image into individual characters using sliding window approach
    that preserves vertical alignment.

    :param line_image: Binary image of a single line
    :return: List of images, each containing a single character or vertically aligned components
    """
    # Ensure the image is binary
    _, binary = cv2.threshold(line_image, 128, 255, cv2.THRESH_BINARY)

    # Get vertical projection profile
    v_proj = np.sum(binary, axis=0)

    # Find character boundaries using sliding window
    window_size = 5  # Adjust based on your image scale
    min_gap = 10  # Minimum gap between characters

    char_boundaries = []
    in_char = False
    char_start = 0

    # Smooth the projection profile to handle small gaps
    smooth_proj = np.convolve(v_proj, np.ones(window_size) / window_size, mode='same')

    # Calculate threshold as a percentage of maximum projection
    threshold = 0.05 * np.max(smooth_proj)

    for i, proj in enumerate(smooth_proj):
        if not in_char and proj > threshold:
            in_char = True
            char_start = max(0, i - window_size // 2)
        elif in_char and proj <= threshold:
            # Only end character if we have a significant gap
            if i - char_start >= window_size:
                # Look ahead to check if this is just a small gap
                look_ahead = min(len(smooth_proj), i + min_gap)
                if np.max(smooth_proj[i:look_ahead]) <= threshold:
                    char_end = min(binary.shape[1], i + window_size // 2)
                    char_boundaries.append((char_start, char_end))
                    in_char = False

    # Handle last character
    if in_char:
        char_end = binary.shape[1]
        char_boundaries.append((char_start, char_end))

    # Extract characters
    characters = []
    for start, end in char_boundaries:
        # Add padding
        pad = 5
        start = max(0, start - pad)
        end = min(binary.shape[1], end + pad)

        char_img = binary[:, start:end]

        # Only add if there's actual content
        if np.sum(char_img) > 0:
            characters.append(char_img)

    return characters
# Define types for our structured representation

def categorize_symbol(char_image: np.ndarray) -> str:
    """
    Placeholder function for categorizing a symbol as special or normal.
    This will be replaced with actual neural network logic later.

    :param char_image: Image of a single character or symbol
    :return: Category of the symbol ('normal', 'fraction', 'exponent', etc.)
    """
    # Placeholder logic - you'll replace this with neural network categorization
    return 'normal'  # For now, treat everything as a normal character


def recognize_symbol(char_image: np.ndarray) -> int:
    """
    Placeholder function for recognizing a symbol using the appropriate neural network.
    This will be replaced with actual neural network logic later.

    :param char_image: Image of a single character or symbol
    :param category: Category of the symbol ('normal', 'fraction', 'exponent', etc.)
    :return: Recognized symbol or structure
    """
    # Placeholder logic - you'll replace this with actual symbol recognition
    processed_char = preprocess_char(char_image, (40,40))
    #do NN work on processed char
    return 14  # For now, return 'x' for every symbol



def detect_fraction(image):
    """
    Detect if an image contains a fraction and if so, separate numerator and denominator.

    :param image: Input image (numpy array)
    :return: tuple (is_fraction, numerator, denominator) or (False, None, None) if not a fraction
    """
    # Ensure the image is grayscale
    if len(image.shape) > 2:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # Binarize the image
  